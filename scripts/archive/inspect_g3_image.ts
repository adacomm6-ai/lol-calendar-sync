import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    // Find JDG vs EDG Game 3
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
        const g3 = match.games.find(g => g.gameNumber === 3);
        if (g3) {
            console.log(`Game 3 ID: ${g3.id}`);
            console.log(`Screenshot: ${g3.screenshot}`);

            if (g3.screenshot) {
                let relative = g3.screenshot;
                if (relative.startsWith('/')) relative = relative.slice(1);
                const fullPath = path.join(process.cwd(), 'public', relative);
                if (fs.existsSync(fullPath)) {
                    console.log(`  -> File Exists on disk.`);
                } else {
                    console.log(`  -> File MISSING on disk.`);
                }
            }
        } else {
            console.log("Game 3 not found.");
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
