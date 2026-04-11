
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const players = ['HOYA', 'GUWON', 'CARE', 'ASSUM', 'ZHUO'];

    const ttId = '4c6da8c9-d5b5-45e9-89cd-85ee696d90ad';

    console.log(`Searching for games involving old roster and TT ID (${ttId})...`);

    const games = await prisma.game.findMany({
        where: {
            OR: [
                { analysisData: { contains: 'HOYA' } },
                { analysisData: { contains: 'GUWON' } },
                { analysisData: { contains: 'CARE' } },
                { analysisData: { contains: 'ASSUM' } },
                { analysisData: { contains: 'ZHUO' } }
            ]
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

    console.log(`Found ${games.length} games. Analyzing side IDs...`);

    const findings = [];

    for (const g of games) {
        let playersInGame = [];
        try {
            const data = JSON.parse(g.analysisData);
            const teamA = data.teamA?.players || [];
            const teamB = data.teamB?.players || [];

            const matchedA = teamA.filter(p => players.includes(p.name));
            const matchedB = teamB.filter(p => players.includes(p.name));

            if (matchedA.length > 0) {
                findings.push({
                    gameId: g.id,
                    match: `${g.match.teamA?.shortName} vs ${g.match.teamB?.shortName}`,
                    tournament: g.match.tournament,
                    teamIdLinked: g.blueSideTeamId || g.match.teamAId,
                    players: matchedA.map(p => p.name)
                });
            }
            if (matchedB.length > 0) {
                findings.push({
                    gameId: g.id,
                    match: `${g.match.teamA?.shortName} vs ${g.match.teamB?.shortName}`,
                    tournament: g.match.tournament,
                    teamIdLinked: g.redSideTeamId || g.match.teamBId,
                    players: matchedB.map(p => p.name)
                });
            }
        } catch (e) { }
    }

    console.log("\n--- Detailed Findings ---");
    findings.forEach(f => {
        console.log(`Game: ${f.gameId} | Match: ${f.match} | Tournament: ${f.tournament}`);
        console.log(`  Linked Team ID: ${f.teamIdLinked} (${f.teamIdLinked === ttId ? '!! MATCHES TT !!' : 'NIP or OTHER'})`);
        console.log(`  Players found: ${f.players.join(', ')}`);
    });

    // Also check Player table
    console.log("\n--- Player Table State ---");
    const dbPlayers = await prisma.player.findMany({
        where: { name: { in: players } },
        include: { team: true }
    });
    dbPlayers.forEach(p => {
        console.log(`Player: ${p.name} | Linked Team: ${p.team?.name} (${p.teamId})`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
