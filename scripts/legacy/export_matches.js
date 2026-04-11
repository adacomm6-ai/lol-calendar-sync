const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const matches = await prisma.match.findMany({
        include: {
            games: true,
            teamA: true,
            teamB: true
        }
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backups/matches_export_${timestamp}.json`;

    fs.writeFileSync(filename, JSON.stringify(matches, null, 2));

    console.log(`Exported ${matches.length} matches to ${filename}`);
}

main();
