const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Starting Player Sync Process...");

    // 1. Fetch all games with analysis data
    const games = await prisma.game.findMany({
        where: {
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

    console.log(`📊 Found ${games.length} games with analysis data.`);

    const newPlayers = [];
    const existingPlayers = new Set();
    const stats = {
        scanned: 0,
        added: 0,
        skipped: 0
    };

    // Helper to normalize strings
    const normalize = (str) => str?.toLowerCase().replace(/\s+/g, '') || '';

    // Cache teams
    const teams = await prisma.team.findMany();
    const teamMap = new Map(); // Name -> ID
    const teamShortMap = new Map(); // ShortName -> ID

    teams.forEach(t => {
        teamMap.set(normalize(t.name), t.id);
        if (t.shortName) teamShortMap.set(normalize(t.shortName), t.id);
    });

    // Cache existing players
    const currentPlayers = await prisma.player.findMany();
    currentPlayers.forEach(p => existingPlayers.add(normalize(p.name)));

    for (const game of games) {
        try {
            const data = JSON.parse(game.analysisData);
            let playersData = [];

            if (data.damage_data) {
                playersData = data.damage_data;
            } else if (data.teamA && data.teamB) {
                playersData = [...(data.teamA.players || []), ...(data.teamB.players || [])];
            }

            for (const p of playersData) {
                stats.scanned++;
                const name = p.name || p.player || p.player_name;
                if (!name) continue;

                const nameNorm = normalize(name);
                if (existingPlayers.has(nameNorm)) {
                    stats.skipped++;
                    continue;
                }

                // New Player Found!
                // Determine Team
                let teamId = null;
                // Try from match context
                // p.team usually "Blue" or "Red" OR actual team name sometimes?
                // Usually damage_data has team: "Blue".
                let teamName = null;
                if (p.team === 'Blue' || p.team === 'BLUE') {
                    teamId = game.match.teamAId ? game.match.teamAId : null; // Usually Blue is TeamA, but check game.blueSideTeamId
                    if (game.blueSideTeamId) teamId = game.blueSideTeamId;
                    if (game.blueSideTeam) teamName = game.blueSideTeam.name;
                } else if (p.team === 'Red' || p.team === 'RED') {
                    teamId = game.redSideTeamId ? game.redSideTeamId : (game.match.teamBId ? game.match.teamBId : null);
                } else {
                    // Maybe p.team is the Team Name?
                    const potentialId = teamMap.get(normalize(p.team)) || teamShortMap.get(normalize(p.team));
                    if (potentialId) teamId = potentialId;
                }

                if (!teamId) {
                    console.log(`⚠️  Could not determine team for player: ${name} (Team Raw: ${p.team})`);
                    continue;
                }

                // Determine Role (heuristic or data)
                // data often has 'role' field or we guess from champion?
                // If missing, default to "Unknown"
                const role = p.role || "Mid"; // Default placeholder if missing

                // Add to DB
                console.log(`✨ Adding Player: ${name} (TeamID: ${teamId})`);
                await prisma.player.create({
                    data: {
                        name: name,
                        teamId: teamId,
                        role: role,
                        split: "Split 1", // Default to current context or derive?
                        // If tournament is Demacia Cup, maybe set "Demacia Cup"?
                        // But usually players persist. Let's set "Split 1" as they are LPL players.
                        // Or check match.tournament? 
                        // If match.tournament.includes("Cup"), strictly set "Demacia Cup"?
                        // User wanted cleanup for Split 1. If I tag them Split 1, they show up.
                        // If I tag them "Demacia Cup", they won't show in Split 1 list.
                        // Most players in Demacia are split 1 players. 
                        // I will determine based on match: 
                        // If match is Demacia Cup -> "Demacia Cup"? No, Wei is LPL Split 1.
                        // I will default to "Split 1" and user can edit if needed.
                    }
                });

                existingPlayers.add(nameNorm);
                stats.added++;
            }

        } catch (e) {
            console.error(`Error processing game ${game.id}:`, e.message);
        }
    }

    console.log("\n✅ Sync Complete!");
    console.log(`Scanned: ${stats.scanned}`);
    console.log(`Added:   ${stats.added}`);
    console.log(`Skipped: ${stats.skipped}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
