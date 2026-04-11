
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Scanning ALL teams for roster issues...');

    const teams = await prisma.team.findMany({
        include: { players: true }
    });

    console.log(`Total Teams: ${teams.length}`);
    let issuesFound = 0;

    for (const team of teams) {
        if (team.players.length === 0) continue;

        // Group by Name (Normalized)
        const nameMap = new Map();
        const junkCandidates = [];

        for (const p of team.players) {
            const norm = p.name.trim().toLowerCase();

            // 1. Check for duplicates
            if (!nameMap.has(norm)) {
                nameMap.set(norm, []);
            }
            nameMap.get(norm).push(p);

            // 2. Check for junk patterns (e.g. "Wuna13", "Flandre1")
            if (/\d+$/.test(p.name)) {
                junkCandidates.push(p);
            }
        }

        // Filter for problems
        const duplicates = [];
        for (const [name, list] of nameMap.entries()) {
            if (list.length > 1) {
                duplicates.push({ name: list[0].name, count: list.length, ids: list.map(x => x.id) });
            }
        }

        if (duplicates.length > 0 || junkCandidates.length > 0) {
            issuesFound++;
            console.log(`\n==================================================`);
            console.log(`🚨 TEAM ISSUE: ${team.name} (${team.shortName}) [ID: ${team.id}]`);

            if (duplicates.length > 0) {
                console.log(`   [Duplicate Names]`);
                duplicates.forEach(d => console.log(`     - ${d.name} (Count: ${d.count})`));
            }

            if (junkCandidates.length > 0) {
                console.log(`   [Suspicious Junk (Numbers)]`);
                junkCandidates.forEach(j => console.log(`     - ${j.name} (Role: ${j.role})`));
            }

            // Context: List all players to see the mix
            // console.log(`   (Full Roster: ${team.players.map(p => p.name).join(', ')})`);
        }
    }

    console.log(`\nScan Complete. Found issues in ${issuesFound} teams.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
