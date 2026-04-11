import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const JSON_FILE = path.join(process.cwd(), 'data', 'demacia_kda_results.json');

async function main() {
    if (!fs.existsSync(JSON_FILE)) {
        console.error("JSON file not found.");
        return;
    }

    const rawData = fs.readFileSync(JSON_FILE, 'utf-8');
    const results = JSON.parse(rawData);

    console.log(`Loaded ${results.length} game records. Starting import...`);

    for (const record of results) {
        // Filename format: TEAM1-TEAM2[GameNum].png
        // e.g. IG-TES1.png, AL-LGD1.png
        const filename = record.filename;
        const matchName = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');

        // Regex to parse: Starts with letters, hyphen, letters, then digits
        const regex = /^([A-Z]+)-([A-Z]+)(\d+)$/i;
        const match = matchName.match(regex);

        if (!match) {
            console.warn(`Skipping invalid filename format: ${filename}`);
            continue;
        }

        const team1Name = match[1].toUpperCase(); // e.g. IG
        const team2Name = match[2].toUpperCase(); // e.g. TES
        const gameNumber = parseInt(match[3], 10);

        console.log(`Processing ${filename}: ${team1Name} vs ${team2Name} (Game ${gameNumber})`);

        // 1. Find Teams IDs
        const team1 = await prisma.team.findFirst({
            where: {
                OR: [
                    { name: team1Name },
                    { shortName: team1Name } // In case name is full name
                ]
            }
        });
        const team2 = await prisma.team.findFirst({
            where: {
                OR: [
                    { name: team2Name },
                    { shortName: team2Name }
                ]
            }
        });

        if (!team1 || !team2) {
            console.error(`  -> Teams not found in DB: ${team1Name} (${!!team1}) vs ${team2Name} (${!!team2})`);
            continue;
        }

        // 2. Find Match
        // We look for a match involving these two teams.
        // To avoid finding old matches, we could filter by date, but simpler is to just find the latest one?
        // Or assume the DB has the Demacia Cup matches created recently.
        const dbMatch = await prisma.match.findFirst({
            where: {
                OR: [
                    { teamAId: team1.id, teamBId: team2.id },
                    { teamAId: team2.id, teamBId: team1.id }
                ],
                // Optional: restrict to recent matches or Demacia Cup if needed
                // tournament: { contains: "Demacia" } 
            },
            orderBy: { startTime: 'desc' },
            include: { games: true }
        });

        if (!dbMatch) {
            console.error(`  -> Match not found for ${team1.name} vs ${team2.name}`);
            continue;
        }

        // 3. Find Game
        let game = dbMatch.games.find(g => g.gameNumber === gameNumber);

        if (!game) {
            console.log(`  -> Game ${gameNumber} not found. Creating new Game record...`);
            game = await prisma.game.create({
                data: {
                    matchId: dbMatch.id,
                    gameNumber: gameNumber,
                    // Default values
                }
            });
        }

        // 4. Update Game
        // Prepare Analysis Data
        // Strip damage from record.damage_data as requested
        if (record.damage_data) {
            record.damage_data = record.damage_data.map((p: any) => {
                const { damage, ...rest } = p;
                return rest;
            });
        }

        // Additional: Update Winner ID?
        let winnerID = game.winnerId;
        if (record.winner === 'Blue') {
            winnerID = game.blueSideTeamId || dbMatch.teamAId; // Fallback
        } else if (record.winner === 'Red') {
            winnerID = game.redSideTeamId || dbMatch.teamBId; // Fallback
        }

        await prisma.game.update({
            where: { id: game.id },
            data: {
                analysisData: JSON.stringify(record),
                // Only update winner if currently null to avoid overwriting manual confirmation? 
                // data extraction is reliable enough for winner usually.
                winnerId: winnerID
            }
        });

        console.log(`  -> Successfully updated Game ${game.id} (Match ${dbMatch.id})`);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
