
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Find Teams
    const teams = await prisma.team.findMany({
        where: {
            OR: [
                { name: { contains: 'AL' } },
                { name: { contains: 'Anyone' } },
                { name: { contains: 'IG' } },
                { name: { contains: 'Invictus' } },
                { shortName: { in: ['AL', 'IG'] } }
            ]
        }
    });

    console.log('Found Teams:', teams.map(t => `${t.name} (${t.id})`));

    const al = teams.find(t => t.name.includes('Anyone') || t.shortName === 'AL' || t.name === 'AL');
    const ig = teams.find(t => t.name.includes('Invictus') || t.shortName === 'IG' || t.name === 'IG');

    if (!al || !ig) {
        console.error('Could not identify AL or IG');
        return;
    }

    console.log(`AL ID: ${al.id}`);
    console.log(`IG ID: ${ig.id}`);

    // 2. Check for Match
    const matches = await prisma.match.findMany({
        where: {
            OR: [
                { teamAId: al.id, teamBId: ig.id },
                { teamAId: ig.id, teamBId: al.id }
            ]
        },
        include: {
            teamA: true,
            teamB: true
        }
    });

    console.log(`Found ${matches.length} matches between AL and IG:`);
    matches.forEach(m => {
        console.log(`- ${m.startTime.toISOString()} (${m.id}) [${m.teamA.name} vs ${m.teamB.name}] Status: ${m.status}`);
    });

    // 3. Check matches on that day broadly
    // UTC 11:00 is 19:00 Beijing.
    // Let's filter slightly wider to be sure.
    // 2026-01-27 19:00 Beijing = 11:00 UTC.
    const dayStart = new Date('2026-01-27T00:00:00Z');
    const dayEnd = new Date('2026-01-28T00:00:00Z');

    const dayMatches = await prisma.match.findMany({
        where: {
            startTime: {
                gte: dayStart,
                lt: dayEnd
            }
        },
        include: {
            teamA: true,
            teamB: true
        },
        orderBy: {
            startTime: 'asc'
        }
    });

    console.log('--- All Matches on 2026-01-27 (UTC) ---');
    dayMatches.forEach(m => {
        console.log(`- ${m.startTime.toISOString()} [${m.teamA.name} vs ${m.teamB.name}]`);
    });
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
