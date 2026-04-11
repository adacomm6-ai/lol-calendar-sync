import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    // Find JDG vs EDG Game 4
    const match = await prisma.match.findFirst({
        where: {
            OR: [
                { teamA: { name: 'JD Gaming' }, teamB: { name: 'EDward Gaming' } },
                { teamA: { name: 'EDward Gaming' }, teamB: { name: 'JD Gaming' } }
            ]
        },
        include: { games: true }
    });

    if (match) {
        const g4 = match.games.find(g => g.gameNumber === 4);
        if (g4) {
            console.log(`Game 4 ID: ${g4.id}`);
            console.log(`Screenshot: ${g4.screenshot}`);

            if (g4.screenshot) {
                let relative = g4.screenshot;
                if (relative.startsWith('/')) relative = relative.slice(1);
                const fullPath = path.join(process.cwd(), 'public', relative);
                if (fs.existsSync(fullPath)) {
                    console.log(`  -> File Exists on disk.`);
                } else {
                    console.log(`  -> File MISSING on disk.`);
                }
            }
        } else {
            console.log("Game 4 not found.");
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
