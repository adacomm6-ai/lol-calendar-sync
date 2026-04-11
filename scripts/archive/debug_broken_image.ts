import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    // Find JDG vs EDG match
    const match = await prisma.match.findFirst({
        where: {
            teamA: { name: 'JD Gaming' },
            teamB: { name: 'EDward Gaming' },
            // or vice versa, but let's try this first
        },
        include: { games: true }
    });

    if (!match) {
        console.log("Match not found (JDG vs EDG). Trying reverse...");
        const match2 = await prisma.match.findFirst({
            where: {
                teamA: { name: 'EDward Gaming' },
                teamB: { name: 'JD Gaming' },
            },
            include: { games: true }
        });
        if (match2) inspectGames(match2);
        else console.log("Match not found reverse either.");
        return;
    }

    inspectGames(match);
}

function inspectGames(match: any) {
    console.log(`Match Found: ${match.id}`);
    const g1 = match.games.find((g: any) => g.gameNumber === 1);

    if (g1) {
        console.log(`Game 1 ID: ${g1.id}`);
        console.log(`Screenshot Path in DB: ${g1.screenshot}`);

        if (g1.screenshot) {
            // Check file existence
            // DB path might be URL relative like '/uploads/...'
            let relative = g1.screenshot;
            if (relative.startsWith('/')) relative = relative.slice(1);

            const fullPath = path.join(process.cwd(), 'public', relative);
            console.log(`Checking file at: ${fullPath}`);
            if (fs.existsSync(fullPath)) {
                console.log("  -> File EXISTS on disk.");
            } else {
                console.log("  -> File MISSING on disk.");
            }
        }
    } else {
        console.log("Game 1 not found.");
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
