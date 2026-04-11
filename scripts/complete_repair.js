
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Starting Complete Database Repair ---");

    const allTeams = await prisma.team.findMany();
    const ttTeam = allTeams.find(t => t.shortName === 'TT' || t.name === 'ThunderTalk Gaming');
    const ttId = ttTeam?.id;

    if (!ttId) {
        console.error("TT Team ID not found!");
        return;
    }
    console.log(`TT Team ID: ${ttId}`);

    // 1. Align side IDs with JSON content
    console.log("\nPhase 1: Aligning side IDs with JSON content...");
    const games = await prisma.game.findMany({
        where: { analysisData: { not: null } },
        include: { match: true }
    });

    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let alignedCount = 0;

    for (const game of games) {
        try {
            const data = JSON.parse(game.analysisData);
            const jsonTeamANormal = normalize(data.teamA?.name);
            const jsonTeamBNormal = normalize(data.teamB?.name);

            if (!jsonTeamANormal || !jsonTeamBNormal) continue;

            const dbBlueTeam = allTeams.find(t => t.id === (game.blueSideTeamId || game.match.teamAId));
            const dbRedTeam = allTeams.find(t => t.id === (game.redSideTeamId || game.match.teamBId));

            const dbBlueName = normalize(dbBlueTeam?.name || '');
            const dbBlueShort = normalize(dbBlueTeam?.shortName || '');
            const dbRedName = normalize(dbRedTeam?.name || '');
            const dbRedShort = normalize(dbRedTeam?.shortName || '');

            const blueMatchesA = jsonTeamANormal.includes(dbBlueName) || dbBlueName.includes(jsonTeamANormal) || (dbBlueShort && jsonTeamANormal.includes(dbBlueShort));
            const blueMatchesB = jsonTeamBNormal.includes(dbBlueName) || dbBlueName.includes(jsonTeamBNormal) || (dbBlueShort && jsonTeamBNormal.includes(dbBlueShort));
            const redMatchesA = jsonTeamANormal.includes(dbRedName) || dbRedName.includes(jsonTeamANormal) || (dbRedShort && jsonTeamANormal.includes(dbRedShort));
            const redMatchesB = jsonTeamBNormal.includes(dbRedName) || dbRedName.includes(jsonTeamBNormal) || (dbRedShort && jsonTeamBNormal.includes(dbRedShort));

            if (!blueMatchesA && blueMatchesB && redMatchesA && !redMatchesB) {
                await prisma.game.update({
                    where: { id: game.id },
                    data: {
                        blueSideTeamId: game.redSideTeamId || game.match.teamBId,
                        redSideTeamId: game.blueSideTeamId || game.match.teamAId
                    }
                });
                alignedCount++;
            }
        } catch (e) { }
    }
    console.log(`Phase 1 complete. Aligned ${alignedCount} games.`);

    // 2. Clear and Rebuild Roster based on Game Statistics
    console.log("\nPhase 2: Rebuilding rosters based on games...");

    // Fetch all games again with potentially updated side IDs
    const updatedGames = await prisma.game.findMany({
        where: {
            OR: [
                { analysisData: { not: null } },
                { teamAStats: { not: null } },
                { teamBStats: { not: null } }
            ]
        },
        include: { match: true }
    });

    const trueRoster = new Map(); // Map<teamId, Set<playerName>>

    const addToRoster = (statsJson, teamId, split) => {
        if (!statsJson || !teamId) return;
        try {
            const stats = JSON.parse(statsJson);
            if (!trueRoster.has(teamId)) trueRoster.set(teamId, new Map());
            const teamMap = trueRoster.get(teamId);

            stats.forEach(p => {
                const name = p.name || p.playerName;
                if (!name) return;
                const nameKey = name.trim().toLowerCase();
                if (!teamMap.has(nameKey)) {
                    teamMap.set(nameKey, { name: name.trim(), splits: new Set() });
                }
                teamMap.get(nameKey).splits.add(split);
            });
        } catch (e) { }
    };

    for (const g of updatedGames) {
        const split = g.match.tournament || 'Unknown';
        if (g.analysisData) {
            const data = JSON.parse(g.analysisData);
            const teamAData = data.teamA?.players || [];
            const teamBData = data.teamB?.players || [];
            addToRoster(JSON.stringify(teamAData), g.blueSideTeamId || g.match.teamAId, split);
            addToRoster(JSON.stringify(teamBData), g.redSideTeamId || g.match.teamBId, split);
        } else {
            addToRoster(g.teamAStats, g.match.teamAId, split);
            addToRoster(g.teamBStats, g.match.teamBId, split);
        }
    }

    // Apply to Database
    const currentPlayers = await prisma.player.findMany();
    let deletedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;

    for (const p of currentPlayers) {
        const teamMap = trueRoster.get(p.teamId);
        const nameKey = p.name.trim().toLowerCase();
        const rosterEntry = teamMap?.get(nameKey);

        if (!rosterEntry) {
            await prisma.player.delete({ where: { id: p.id } });
            deletedCount++;
        } else {
            const finalSplits = new Set(p.split ? p.split.split(',').map(s => s.trim()) : []);
            let needsUpdate = false;
            rosterEntry.splits.forEach(s => {
                if (!finalSplits.has(s)) {
                    finalSplits.add(s);
                    needsUpdate = true;
                }
            });

            if (needsUpdate) {
                await prisma.player.update({
                    where: { id: p.id },
                    data: { split: Array.from(finalSplits).join(', ') }
                });
                updatedCount++;
            }
            teamMap.delete(nameKey); // Mark as processed
        }
    }

    // Create remaining
    for (const [tId, teamMap] of trueRoster.entries()) {
        for (const [nameKey, entry] of teamMap.entries()) {
            await prisma.player.create({
                data: {
                    name: entry.name,
                    role: 'Unknown',
                    teamId: tId,
                    split: Array.from(entry.splits).join(', ')
                }
            });
            createdCount++;
        }
    }

    console.log(`Phase 2 complete.`);
    console.log(`Summary: Deleted ${deletedCount}, Updated ${updatedCount}, Created ${createdCount}.`);

    console.log("\n--- Repair Finished ---");
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
