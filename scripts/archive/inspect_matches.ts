import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const ids = ['5f14585c-760f-45b4-99c8-656a54e543be', '44aa8933-25c3-4221-9a8b-034113125d84'];

    for (const id of ids) {
        const match = await prisma.match.findUnique({
            where: { id },
            include: { games: true }
        });

        if (!match) continue;

        console.log(`\nMatch: ${id}`);
        console.log(`Date: ${match.startTime}`);
        console.log(`Games: ${match.games.length}`);
        match.games.forEach(g => {
            const hasAnalysis = !!g.analysisData;
            console.log(`  Game ${g.gameNumber}: AnalysisData=${hasAnalysis}`);
            if (hasAnalysis) {
                // Peek at analysis data
                const d = JSON.parse(g.analysisData!);
                console.log(`    Winner: ${g.winnerId}`);
                console.log(`    KDA Source: ${d.match || 'Unknown'}`); // Check my signature
            }
        });
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
