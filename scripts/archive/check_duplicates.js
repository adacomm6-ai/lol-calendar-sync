const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matches = await prisma.match.findMany({
        where: {
            tournament: { contains: '2026' }
        },
        include: { teamA: true, teamB: true }
    });

    const signatureMap = new Map();
    const duplicates = [];

    matches.forEach(m => {
        // Signature: Date(YYYY-MM-DD) + TeamA + TeamB
        const date = m.startTime.toISOString().split('T')[0];
        const teams = [m.teamA.shortName, m.teamB.shortName].sort().join('-');
        const key = `${date}|${teams}`;

        if (signatureMap.has(key)) {
            duplicates.push({ original: signatureMap.get(key), duplicate: m });
        } else {
            signatureMap.set(key, m);
        }
    });

    console.log(`Found ${duplicates.length} duplicates.`);
    duplicates.forEach(d => {
        console.log(`Dup: ${d.duplicate.id} (${d.duplicate.teamA.shortName}-${d.duplicate.teamB.shortName}) existing ${d.original.id}`);
    });
}

main();
