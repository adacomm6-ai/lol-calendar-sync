const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Auditing Split 1 Rosters for LPL & LCK...");

    const teams = await prisma.team.findMany({
        where: {
            region: { in: ['LPL', 'LCK'] }
        },
        include: {
            players: {
                where: { split: 'Split 1' }
            }
        },
        orderBy: { region: 'asc' }
    });

    console.log(`\nFound ${teams.length} teams.`);
    console.log("---------------------------------------------------");
    console.log("| Region | Team       | Total | TOP | JUG | MID | ADC | SUP |");
    console.log("---------------------------------------------------");

    const issues = [];

    for (const team of teams) {
        const counts = { TOP: 0, JUNGLE: 0, MID: 0, ADC: 0, SUPPORT: 0 };
        team.players.forEach(p => {
            // Normalized role check
            const r = p.role.toUpperCase();
            if (counts[r] !== undefined) counts[r]++;
            // Handle 'BOT' as ADC if exists, or distinct roles
        });

        const total = team.players.length;
        const missingRoles = Object.entries(counts).filter(([_, c]) => c === 0).map(([r]) => r);

        console.log(`| ${team.region.padEnd(6)} | ${team.shortName.padEnd(10)} | ${String(total).padEnd(5)} | ${String(counts.TOP).padEnd(3)} | ${String(counts.JUNGLE).padEnd(3)} | ${String(counts.MID).padEnd(3)} | ${String(counts.ADC).padEnd(3)} | ${String(counts.SUPPORT).padEnd(3)} |`);

        if (total < 5 || missingRoles.length > 0) {
            issues.push({ team: team.name, short: team.shortName, region: team.region, missing: missingRoles, total });
        }
    }

    console.log("---------------------------------------------------");

    if (issues.length > 0) {
        console.log("\n[POTENTIAL ISSUES FOUND]");
        issues.forEach(i => {
            console.log(`- ${i.region} ${i.team} (${i.short}): ${i.total} Players. Missing: ${i.missing.join(', ')}`);
        });
    } else {
        console.log("\n[SUCCESS] All teams have at least 5 players and coverage for all 5 roles.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
