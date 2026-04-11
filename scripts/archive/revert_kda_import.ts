import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const KDA_SOURCE_FILE = path.join(process.cwd(), 'data', 'demacia_kda_results.json');

async function main() {
    if (!fs.existsSync(KDA_SOURCE_FILE)) {
        console.error("KDA JSON file not found. Cannot identify which games to revert.");
        return;
    }

    const rawKdaData = fs.readFileSync(KDA_SOURCE_FILE, 'utf-8');
    const kdaRecords = JSON.parse(rawKdaData);

    console.log(`Loaded ${kdaRecords.length} records. Reverting KDA data...`);

    for (const record of kdaRecords) {
        const filename = record.filename; // e.g. "IG-JDG1.png"
        const matchName = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        const regex = /^([A-Z]+)-([A-Z]+)(\d+)$/i;
        const match = matchName.match(regex);

        if (!match) continue;

        const team1Name = match[1].toUpperCase();
        const team2Name = match[2].toUpperCase();
        const gameNumber = parseInt(match[3], 10);

        // Find Team Ids
        const team1 = await prisma.team.findFirst({ where: { OR: [{ name: team1Name }, { shortName: team1Name }] } });
        const team2 = await prisma.team.findFirst({ where: { OR: [{ name: team2Name }, { shortName: team2Name }] } });

        if (!team1 || !team2) continue;

        // Find Finished Match
        const dbMatch = await prisma.match.findFirst({
            where: {
                OR: [
                    { teamAId: team1.id, teamBId: team2.id },
                    { teamAId: team2.id, teamBId: team1.id }
                ],
                status: 'FINISHED'
            },
            include: { games: true }
        });

        if (!dbMatch) continue;

        const game = dbMatch.games.find(g => g.gameNumber === gameNumber);

        if (game && game.analysisData) {
            try {
                const data = JSON.parse(game.analysisData);

                // 1. Remove KDA from damage_data
                if (data.damage_data && Array.isArray(data.damage_data)) {
                    data.damage_data = data.damage_data.map((p: any) => {
                        // Destructure to remove specific keys
                        const { kills, deaths, assists, damage, ...rest } = p;
                        return rest;
                    });
                }

                // 2. Remove top-level stats
                delete data.blue_kills;
                delete data.red_kills;
                delete data.total_kills;

                // 3. Save
                await prisma.game.update({
                    where: { id: game.id },
                    data: {
                        analysisData: JSON.stringify(data),
                        blueKills: 0,
                        redKills: 0,
                        totalKills: 0
                    }
                });
                console.log(`  -> Reverted KDA for Game ${game.id} (${team1Name} vs ${team2Name} G${gameNumber})`);

            } catch (e) {
                console.error(`  -> Parse error for Game ${game.id}`, e);
            }
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
