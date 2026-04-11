import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    // Find JDG vs EDG Game 2
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
        const g2 = match.games.find(g => g.gameNumber === 2);
        if (g2 && g2.screenshot) {
            let relative = g2.screenshot;
            if (relative.startsWith('/')) relative = relative.slice(1);
            const fullPath = path.join(process.cwd(), 'public', relative);

            if (fs.existsSync(fullPath)) {
                // Rename to simple unique
                const newName = `simple_g2_${Date.now()}.png`;
                const newPath = path.join(path.dirname(fullPath), newName);

                fs.renameSync(fullPath, newPath);

                await prisma.game.update({
                    where: { id: g2.id },
                    data: { screenshot: `/uploads/${newName}` }
                });
                console.log(`Renamed G2 to /uploads/${newName}`);
            } else {
                console.log("G2 file missing.");
            }
        } else {
            console.log("G2 or screenshot missing.");
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
