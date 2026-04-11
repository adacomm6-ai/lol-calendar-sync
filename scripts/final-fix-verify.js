const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const loudPlayers = [
        { name: 'Xyn0', role: 'TOP' },
        { name: 'YoungJae', role: 'JUNGLE' },
        { name: 'Envy', role: 'MID' },
        { name: 'Bull', role: 'ADC' },
        { name: 'RedBert', role: 'SUPPORT' }
    ];

    console.log('--- Fixing LOUD Roster Roles ---');
    for (const p of loudPlayers) {
        const result = await prisma.player.updateMany({
            where: {
                teamId: 'LOUD',
                name: p.name
            },
            data: {
                role: p.role
            }
        });
        console.log(`Updated ${p.name} to ${p.role}: ${result.count} records.`);
    }

    console.log('\n--- Final Verification: NIP Roster Count ---');
    const nipCount = await prisma.player.count({
        where: { teamId: '0d900a1a-c0fc-4965-83c6-cc9844700ca1' }
    });
    console.log(`NIP now has ${nipCount} players (Expected: 5).`);
}

main().finally(() => prisma.$disconnect());
