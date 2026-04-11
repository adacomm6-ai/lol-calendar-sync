import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const games = await prisma.game.findMany({
        where: { analysisData: { not: null } }
    });

    let unknownCount = 0;
    games.forEach(g => {
        const data = JSON.parse(g.analysisData!);
        const players = data.damage_data || [];
        const unknowns = players.filter((p: any) => p.hero === 'Unknown' || !p.hero);
        if (unknowns.length > 0) {
            console.log(`Game ${g.id} (G${g.gameNumber}) has ${unknowns.length} Unknown heroes.`);
            unknownCount++;
        }
    });

    console.log(`\nTotal games with Unknown heroes: ${unknownCount}`);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
