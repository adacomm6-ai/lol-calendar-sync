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
        if (g4 && g4.screenshot) {
            let relative = g4.screenshot;
            if (relative.startsWith('/')) relative = relative.slice(1);
            const fullPath = path.join(process.cwd(), 'public', relative);

            if (fs.existsSync(fullPath)) {
                // Rename to simple unique
                const newName = `simple_g4_${Date.now()}.png`;
                const newPath = path.join(path.dirname(fullPath), newName);

                fs.renameSync(fullPath, newPath);

                await prisma.game.update({
                    where: { id: g4.id },
                    data: { screenshot: `/uploads/${newName}` }
                });
                console.log(`Renamed G4 to /uploads/${newName}`);
            } else {
                console.log("G4 file missing.");
            }
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
