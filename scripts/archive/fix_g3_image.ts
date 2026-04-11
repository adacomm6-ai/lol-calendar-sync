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
        if (g3 && g3.screenshot) {
            let relative = g3.screenshot;
            if (relative.startsWith('/')) relative = relative.slice(1);
            const fullPath = path.join(process.cwd(), 'public', relative);

            if (fs.existsSync(fullPath)) {
                // Rename to simple unique
                const newName = `simple_g3_${Date.now()}.png`;
                const newPath = path.join(path.dirname(fullPath), newName);

                fs.renameSync(fullPath, newPath);

                await prisma.game.update({
                    where: { id: g3.id },
                    data: { screenshot: `/uploads/${newName}` }
                });
                console.log(`Renamed G3 to /uploads/${newName}`);
            } else {
                console.log("G3 file missing.");
            }
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
