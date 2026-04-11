import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    const match = await prisma.match.findFirst({
        where: {
            OR: [
                { teamA: { name: 'JD Gaming' }, teamB: { name: 'EDward Gaming' } },
                { teamA: { name: 'EDward Gaming' }, teamB: { name: 'JD Gaming' } }
            ]
        },
        include: { games: true }
    });

    if (!match) {
        console.log("Match not found.");
        return;
    }

    console.log(`Match: ${match.teamAId} vs ${match.teamBId} (${match.status})`);

    for (const g of match.games) {
        console.log(`Game ${g.gameNumber}:`);
        console.log(`  Main: ${g.screenshot || 'NULL'}`);
        if (g.screenshot) checkFile(g.screenshot);

        console.log(`  Supp: ${g.screenshot2 || 'NULL'}`);
        if (g.screenshot2) checkFile(g.screenshot2);
    }
}

function checkFile(relPath: string) {
    if (relPath.startsWith('/')) relPath = relPath.slice(1);
    const fullPath = path.join(process.cwd(), 'public', relPath);
    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(`    -> Exists (${stats.size} bytes). Path: ${relPath}`);
    } else {
        console.log(`    -> MISSING! Path: ${relPath}`);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
