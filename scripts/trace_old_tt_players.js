
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const players = ['HOYA', 'GUWON', 'CARE', 'ASSUM', 'ZHUO'];

    for (const name of players) {
        console.log(`\nInvestigating player: ${name}`);
        const games = await prisma.game.findMany({
            where: {
                OR: [
                    { teamAStats: { contains: `\"name\":\"${name}\"` } },
                    { teamBStats: { contains: `\"name\":\"${name}\"` } },
                    { analysisData: { contains: `\"name\":\"${name}\"` } }
                ]
            },
            include: {
                match: true
            }
        });

        if (games.length === 0) {
            console.log(" - No games found.");
        } else {
            games.forEach(g => {
                console.log(` - Game ID: ${g.id}, Match Tournament: ${g.match.tournament}, Date: ${g.match.startTime}`);
            });
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
