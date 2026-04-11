
import { prisma } from '../../src/lib/db';

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

    const al = teams.find(t => t.name.includes('Anyone') || t.shortName === 'AL');
    const ig = teams.find(t => t.name.includes('Invictus') || t.shortName === 'IG');

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
        const timeStr = m.startTime ? m.startTime.toISOString() : 'TBD';
        const teamA = m.teamA?.name || 'TBD';
        const teamB = m.teamB?.name || 'TBD';
        console.log(`- ${timeStr} (${m.id}) [${teamA} vs ${teamB}] Status: ${m.status}`);
    });

    // 3. Check matches on that day broadly
    const dayStart = new Date('2026-01-27T00:00:00Z');
    const dayEnd = new Date('2026-01-28T00:00:00Z');

    const dayMatches = await prisma.match.findMany({
        where: {
            startTime: {
                gte: dayStart, // If startTime is null, it won't match this filter, so safe?
                // Wait, if startTime is null, it is not >= date. So filter excludes nulls.
                // But TS might complain if I try to filter on nullable without undefined check? 
                // Prisma handles `gte` on nullable DateTime fine (it filters out nulls).
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
        // Here m.startTime IS NOT NULL because of the filter? 
        // Prisma return type might still say Date | null.
        const timeStr = m.startTime ? m.startTime.toISOString() : 'TBD';
        const teamA = m.teamA?.name || 'TBD';
        const teamB = m.teamB?.name || 'TBD';
        console.log(`- ${timeStr} [${teamA} vs ${teamB}]`);
    });
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
