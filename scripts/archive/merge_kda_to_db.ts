import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const KDA_SOURCE_FILE = path.join(process.cwd(), 'data', 'demacia_kda_results.json');

async function main() {
    if (!fs.existsSync(KDA_SOURCE_FILE)) {
        console.error("KDA JSON file not found.");
        return;
    }

    const rawKdaData = fs.readFileSync(KDA_SOURCE_FILE, 'utf-8');
    const kdaRecords = JSON.parse(rawKdaData);

    console.log(`Loaded ${kdaRecords.length} KDA records. Starting MERGE import...`);

    for (const kdaRecord of kdaRecords) {
        const filename = kdaRecord.filename;
        const matchName = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        const regex = /^([A-Z]+)-([A-Z]+)(\d+)$/i;
        const match = matchName.match(regex);

        if (!match) continue;

        const team1Name = match[1].toUpperCase();
        const team2Name = match[2].toUpperCase();
        const gameNumber = parseInt(match[3], 10);

        console.log(`Processing ${filename}: ${team1Name} vs ${team2Name} (Game ${gameNumber})`);

        // Find Teams
        const team1 = await prisma.team.findFirst({ where: { OR: [{ name: team1Name }, { shortName: team1Name }] } });
        const team2 = await prisma.team.findFirst({ where: { OR: [{ name: team2Name }, { shortName: team2Name }] } });

        if (!team1 || !team2) {
            console.log(`  -> Teams not found: ${team1Name}/${team2Name}`);
            continue;
        }

        // Find Match
        const dbMatch = await prisma.match.findFirst({
            where: {
                OR: [
                    { teamAId: team1.id, teamBId: team2.id },
                    { teamAId: team2.id, teamBId: team1.id }
                ],
                // Target only finished matches (Demacia Cup)
                status: 'FINISHED'
            },
            orderBy: { startTime: 'desc' },
            include: { games: true }
        });

        if (!dbMatch) {
            console.log(`  -> Match not found.`);
            continue;
        }

        // Find Game
        let game = dbMatch.games.find(g => g.gameNumber === gameNumber);

        if (!game) {
            // If game missing, we create it (Safe to use full record as base since nothing to preserve)
            console.log(`  -> Game ${gameNumber} not found. Creating...`);
            game = await prisma.game.create({
                data: {
                    matchId: dbMatch.id,
                    gameNumber: gameNumber,
                    // Remove damage data from KDA record before saving
                    analysisData: JSON.stringify(removeDamage(kdaRecord)),
                    winnerId: determineWinnerId(kdaRecord.winner, dbMatch, game)
                }
            });
            continue;
        }

        // Game Exists - MERGE
        let existingData: any = {};
        try {
            existingData = game.analysisData ? JSON.parse(game.analysisData) : {};
        } catch (e) {
            existingData = {};
        }

        // We want to KEEP existingData structure (Gold curves, duration, 10m kills etc)
        // And UPDATE the player stats with KDA from `kdaRecord`

        // 1. Merge Players
        const mergedDamageData = mergePlayerStats(existingData.damage_data || [], kdaRecord.damage_data || []);

        // 2. Update specific fields if missing in existing, or overwrite if KDA source is trusted
        existingData.damage_data = mergedDamageData;

        // Update top-level Kills if present in KDA record
        // (The KDA record has accurate total kills from the scoreboard text usually)
        if (kdaRecord.blue_kills !== undefined) existingData.blue_kills = kdaRecord.blue_kills;
        if (kdaRecord.red_kills !== undefined) existingData.red_kills = kdaRecord.red_kills;
        if (kdaRecord.total_kills !== undefined) existingData.total_kills = kdaRecord.total_kills;

        // Strip Damage from the *merged* result if user requested no damage?
        // User requested "Clear damage data" from the *KDA Import*. 
        // If existing data had damage (from graph), should we keep it? 
        // User said "Subsequent 25 screenshots only for KDA".
        // Let's explicitly remove 'damage' field from the player objects in `damage_data` to be safe/compliant.
        existingData.damage_data = existingData.damage_data.map((p: any) => {
            const { damage, ...rest } = p;
            return rest;
        });

        // Save
        await prisma.game.update({
            where: { id: game.id },
            data: {
                analysisData: JSON.stringify(existingData),
                // Update specific columns on Game model too if needed for queries
                blueKills: existingData.blue_kills,
                redKills: existingData.red_kills,
                totalKills: existingData.total_kills,
                winnerId: determineWinnerId(kdaRecord.winner, dbMatch, game)
            }
        });

        console.log(`  -> Merged KDA into Game ${game.id}`);
    }
}

function removeDamage(record: any) {
    if (record.damage_data) {
        record.damage_data = record.damage_data.map((p: any) => {
            const { damage, ...rest } = p;
            return rest;
        });
    }
    return record;
}

function mergePlayerStats(existingPlayers: any[], newPlayers: any[]) {
    // If existing is empty, return new
    if (!existingPlayers || existingPlayers.length === 0) return newPlayers;

    // Try to match players
    // New Players usually have correct Names and KDA.
    // Existing Players (from Graph) might have Hero/Role but incomplete Names or estimated stats.

    // Strategy: We assume the `newPlayers` (from Scoreboard) is the Truth for ROSTER and KDA.
    // We want to preserve 'hero_avatar' or other metadata from `existingPlayers` if available and matching.

    // Actually, simply replacing the player list is often safer IF the new list is complete (5v5).
    // But we might lose 'gold' or 'damage' (if we wanted to keep damage).
    // User wants to CLEAR damage. 

    // So main value to preserve from Existing is:
    // - Hero Avatar URL? (Scoreboard analysis might provide hero name but not URL)
    // - Role? (Scoreboard analysis infers role)

    // Given the request context: "Use post-match chart as priority".
    // This implies existing data (from charts) has BETTER structure (correct lineup/hero).
    // The Scoreboard data has BETTER KDA.

    // Mapping:
    const merged = [...existingPlayers];

    newPlayers.forEach(newP => {
        // Find matching player in existing
        // Match by Name (fuzzy) or Role+Team
        let match = merged.find(p => isSamePlayer(p, newP));

        if (match) {
            // Update KDA
            match.kills = newP.kills;
            match.deaths = newP.deaths;
            match.assists = newP.assists;
            match.hero = newP.hero || match.hero; // Trust Scoreboard hero if present? Or Graph? 
            // Usually Scoreboard hero is accurate if icon is clear.
            // match.name = newP.name; // Update name (ocr might be better or worse)
        } else {
            // New player not in existing list? 
            // If existing list is partial, add. 
            // If existing list is full (10 players), maybe mapping failed?
            // Let's assume we push if distinct.
            // But usually we just want to update stats.
        }
    });

    // If existing list was empty, we returned newPlayers earlier.
    // If we updated merged, return it.
    return merged;
}

function isSamePlayer(p1: any, p2: any) {
    // 1. Name Match
    if (p1.name && p2.name && p1.name.toLowerCase() === p2.name.toLowerCase()) return true;

    // 2. Role + Team Match (Fallback)
    if (p1.team === p2.team && p1.role === p2.role && p1.role !== 'Unknown') return true;

    return false;
}

function determineWinnerId(winnerStr: string, match: any, game: any) {
    if (!winnerStr) return game.winnerId;
    if (winnerStr === 'Blue') return match.teamAId; // Assuming A is Blue default if fields missing
    if (winnerStr === 'Red') return match.teamBId;
    return game.winnerId;
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
