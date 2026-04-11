
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tt = await prisma.team.findFirst({
        where: {
            OR: [
                { name: { contains: 'Thunder' } },
                { shortName: 'TT' }
            ]
        },
        include: {
            players: true
        }
    });

    if (!tt) {
        console.log("TT Team not found");
        return;
    }

    console.log(`Team: ${tt.name} (ID: ${tt.id})`);
    console.log("Current Roster:");
    tt.players.forEach(p => {
        console.log(` - ${p.name} (${p.role}) - Split: ${p.split}`);
    });

    const anomalyPlayers = ["Keshi", "Junhao", "Heru", "Ryan3", "Feather"];

    console.log("\nSearching for games involving anomaly players...");
    for (const name of anomalyPlayers) {
        const games = await prisma.game.findMany({
            where: {
                OR: [
                    { teamAStats: { contains: `"${name}"` } },
                    { teamBStats: { contains: `"${name}"` } },
                    { analysisData: { contains: `"${name}"` } }
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

        console.log(`\nPlayer: ${name}`);
        if (games.length === 0) {
            console.log(" - No games found in database.");
        } else {
            games.forEach(g => {
                console.log(` - Game ID: ${g.id} (Match: ${g.match.teamA?.shortName} vs ${g.match.teamB?.shortName}, Tournament: ${g.match.tournament})`);
                console.log(`   Match ID: ${g.matchId}`);
                console.log(`   Blue: ${g.blueSideTeamId}, Red: ${g.redSideTeamId}`);
            });
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
