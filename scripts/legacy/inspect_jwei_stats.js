const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectMatch() {
    // Find IG vs WBG match on 2026-01-14
    // IG ID: ? We can search by team name
    const ig = await prisma.team.findFirst({ where: { name: 'Invictus Gaming' } });
    const wbg = await prisma.team.findFirst({ where: { name: 'Weibo Gaming' } });

    if (!ig || !wbg) {
        console.log('Teams not found');
        return;
    }

    // Find matches between them recently
    const matches = await prisma.match.findMany({
        where: {
            OR: [
                { teamAId: ig.id, teamBId: wbg.id },
                { teamAId: wbg.id, teamBId: ig.id }
            ]
        },
        include: {
            games: true
        },
        orderBy: {
            startTime: 'desc'
        }
    });

    if (matches.length === 0) {
        console.log('No match found');
        return;
    }

    // Iterate all matches to find one with games
    const match = matches.find(m => m.games.length > 0);

    if (!match) {
        console.log('Match found but no games linked.');
        return;
    }

    console.log(`Match found: ${match.id} | ${match.startTime} | Games: ${match.games.length}`);

    match.games.forEach(game => {
        console.log(`\n--- Game ${game.gameNumber} ---`);
        if (game.analysisData) {
            const data = JSON.parse(game.analysisData);
            console.log('Analysis Data Players:');

            // Try to handle different formats
            let players = [];
            if (data.damage_data) {
                players = data.damage_data;
            } else if (data.teamA && data.teamB) {
                players = [...data.teamA.players, ...data.teamB.players];
            }

            players.forEach(p => {
                const name = p.name || p.player || p.player_name;
                const hero = p.hero;
                const kda = p.kda || `${p.kills}/${p.deaths}/${p.assists}`;
                console.log(`  Player: ${name} | Hero: ${hero} | KDA: ${kda}`);
            });
        } else {
            console.log('No analysis data');
        }
    });
}

inspectMatch();
