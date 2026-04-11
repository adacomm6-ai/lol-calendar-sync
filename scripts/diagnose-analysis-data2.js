const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const games = await prisma.game.findMany({
        where: { analysisData: { not: null } },
        take: 5
    });

    for (const game of games) {
        console.log(`\nGame ID: ${game.id}`);
        const data = JSON.parse(game.analysisData);
        let players = [];
        if (data.damage_data) players = data.damage_data;
        else if (data.teamA && data.teamA.players) players = [...data.teamA.players, ...(data.teamB ? data.teamB.players : [])];

        console.log(players.map((p, i) => `${i}: ${p.name || p.player} (${p.team})`).join(', '));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
