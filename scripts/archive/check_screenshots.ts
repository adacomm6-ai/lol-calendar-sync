import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const games = await prisma.game.findMany({
        take: 10,
        where: {
            analysisData: { not: null }
        },
        select: {
            id: true,
            match: { select: { teamA: { select: { name: true } }, teamB: { select: { name: true } } } },
            gameNumber: true,
            screenshot: true,
            analysisData: true
        }
    });

    console.log(`Checking ${games.length} games for screenshot availability...`);
    games.forEach(g => {
        console.log(`\nGame: ${g.match.teamA?.name || 'TBD'} vs ${g.match.teamB?.name || 'TBD'} (G${g.gameNumber})`);
        console.log(`  Screenshot Path: ${g.screenshot || 'None'}`);
        // Check if heroes look weird in analysisData
        const data = JSON.parse(g.analysisData as string);
        const heroes = (data.damage_data || []).map((p: any) => p.hero).join(', ');
        console.log(`  Current Heroes: ${heroes}`);
    });
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
