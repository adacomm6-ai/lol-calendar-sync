const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROLE_ORDER = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

async function main() {
    console.log('Starting Demacia Cup Player Import...');

    const tournamentKeyword = '德玛西亚杯';
    const splitName = '2026 Season Cup';

    // 1. Find relevant games
    const games = await prisma.game.findMany({
        where: {
            match: {
                tournament: { contains: tournamentKeyword }
            },
            analysisData: { not: null }
        },
        include: {
            match: {
                include: {
                    teamA: true,
                    teamB: true
                }
            }
        }
    });

    console.log(`Found ${games.length} games with analysis data.`);

    let importedCount = 0;
    const playerSet = new Set(); // Track unique players processed in this run to log unique count

    for (const game of games) {
        try {
            const data = JSON.parse(game.analysisData);
            if (!data.damage_data) continue;

            const { teamA, teamB } = game.match;
            const blueSideTeamId = game.blueSideTeamId;
            const redSideTeamId = game.redSideTeamId;

            // Identify Teams
            // analysisData.damage_data uses "Blue" and "Red" or team names
            // We need to map them back to prisma Team IDs.

            // The data structure is flat array of objects: { name, team: 'Blue'|'Red', ... }
            const bluePlayers = data.damage_data.filter(p => p.team === 'Blue' || (game.blueSideTeamId === teamA.id ? p.team === teamA.name : p.team === teamB.name));
            const redPlayers = data.damage_data.filter(p => p.team === 'Red' || (game.redSideTeamId === teamA.id ? p.team === teamA.name : p.team === teamB.name));

            // Determine which Team ID corresponds to Blue/Red
            const blueTeamId = game.blueSideTeamId;
            const redTeamId = game.redSideTeamId;

            if (!blueTeamId || !redTeamId) {
                console.warn(`Game ${game.id} missing side info. Skipping.`);
                continue;
            }

            // Upsert Blue Team Players
            await processPlayers(bluePlayers, blueTeamId, splitName);
            // Upsert Red Team Players
            await processPlayers(redPlayers, redTeamId, splitName);

        } catch (e) {
            console.error(`Error processing game ${game.id}:`, e.message);
        }
    }

    console.log(`Import completed.`);

    async function processPlayers(players, teamId, split) {
        if (!players || players.length === 0) return;

        // Sort by something? Usually they come ordered by position, but let's just assume order.
        // If we have 5 players, assume standard order.

        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const name = p.name ? p.name.trim() : null;
            if (!name) continue;

            // Guess role if index < 5
            const role = i < 5 ? ROLE_ORDER[i] : 'SUB';

            // Check if player exists
            // We want to update or create
            // If checking by name + team is tricky if they changed teams.
            // But for this specific tournament import, we assume name match.
            // Actually, we should check unique constraint. Player is ID based.
            // We should search by `name`. If found, check if they already have this split entry?
            // Wait, our `Player` table is normalized?
            // Schema has `Player` linked to `Team`.
            // If a player moves teams, we adjust the `teamId`.
            // But `split` is a field on `Player`.
            // This suggests `Player` entity represents a "Player on a Team for a specific Split/Context" or just "Current State".
            // If `Player` schema has `split` string, it means one record per player per split? No, usually ID is unique.
            // Let's check Schema.
            // Based on `src/app/teams/[id]/page.tsx`: include `players`.
            // It seems `Player` model has `split`.
            // If multiple splits, do we have multiple records?
            // "split" is a String.
            // If we want history, we arguably need `PlayerSplit` table or duplicate records.
            // Given the user request "add Demacia Cup as sub-item", implies potentially new records or updating existing.
            // If I change a player's `split` to 'Demacia Cup', they disappear from 'Split 1'?
            // This schema might be "Roster Entry" rather than "Unique Human".
            // If so, I should create NEW records for this split.

            // Check if player exists for this Team and Split
            const existing = await prisma.player.findFirst({
                where: {
                    name: name,
                    teamId: teamId,
                    split: split
                }
            });

            if (existing) {
                // Skip or update?
                continue;
            }

            // Create new roster entry
            await prisma.player.create({
                data: {
                    name: name,
                    teamId: teamId,
                    role: role,
                    split: split,
                    // Avatar? We don't have player avatar in match data, only hero avatar.
                    // Leave blank or default.
                }
            });
            process.stdout.write('.');
            importedCount++;
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
