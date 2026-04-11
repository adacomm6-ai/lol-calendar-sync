
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function main() {
    console.log('--- Data Integrity Check ---');

    // 1. Check Teams
    const teams = await prisma.team.findMany({
        orderBy: { name: 'asc' }
    });
    console.log(`Total Teams Found: ${teams.length}`);

    const teamMap = new Map();
    const potentialTeamDupes = [];

    for (const t of teams) {
        const sName = t.shortName || t.name; // Fallback if shortName is null
        if (!sName) {
            console.log(`[WARN] Team with ID ${t.id} has no name/shortName.`);
            continue;
        }
        const key = sName.toLowerCase().trim();

        if (teamMap.has(key)) {
            potentialTeamDupes.push({ original: teamMap.get(key), duplicate: t });
        } else {
            teamMap.set(key, t);
        }
    }

    if (potentialTeamDupes.length > 0) {
        console.log('\n[!] Potential Duplicate Teams (by ShortName):');
        potentialTeamDupes.forEach(d => {
            console.log(`    - ${d.original.shortName || d.original.name} (${d.original.region}) vs ${d.duplicate.shortName || d.duplicate.name} (${d.duplicate.region})`);
        });
    } else {
        console.log('\n[OK] No exact team shortName duplicates found.');
    }

    // List all teams
    console.log('\n--- Team List ---');
    teams.forEach(t => console.log(`[${t.region || '??'}] ${t.shortName || t.name}`));

    // 2. Check Matches
    const matches = await prisma.match.findMany({
        include: { teamA: true, teamB: true, games: true },
        orderBy: { startTime: 'desc' }
    });
    console.log(`\nTotal Matches Found: ${matches.length}`);

    const matchMap = new Map();
    const matchDupes = [];

    for (const m of matches) {
        // Key: Date(Day) + TeamA + TeamB
        const dateStr = m.startTime.toISOString().split('T')[0];
        const tA = m.teamA?.shortName || m.teamA?.name || 'UnknownA';
        const tB = m.teamB?.shortName || m.teamB?.name || 'UnknownB';
        // Sort teams to handle A vs B and B vs A as same match
        const teamKey = [tA, tB].sort().join('_vs_');
        const uniqueKey = `${dateStr}_${teamKey}`;

        if (matchMap.has(uniqueKey)) {
            matchDupes.push({ original: matchMap.get(uniqueKey), duplicate: m });
        } else {
            matchMap.set(uniqueKey, m);
        }
    }

    if (matchDupes.length > 0) {
        console.log('\n[!] Potential Duplicate Matches:');
        matchDupes.forEach(d => {
            const tA = d.original.teamA?.shortName || '??';
            const tB = d.original.teamB?.shortName || '??';
            console.log(`    - ${d.original.startTime.toISOString().split('T')[0]}: ${tA} vs ${tB} (ID: ${d.original.id})`);
            console.log(`      DUPLICATE: (ID: ${d.duplicate.id}) - Games: ${d.duplicate.games.length}`);
        });
    } else {
        console.log('\n[OK] No duplicate matches found (checked by Date + Teams).');
    }

}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
