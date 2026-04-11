const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const nipId = '0d900a1a-c0fc-4965-83c6-cc9844700ca1';
    const players = await prisma.player.findMany({
        where: {
            teamId: { in: ['LOUD', nipId] }
        },
        orderBy: [
            { teamId: 'asc' },
            { role: 'asc' }
        ]
    });

    console.log('--- FINAL ROSTER VERIFICATION ---');
    console.table(players.map(p => ({
        Team: p.teamId === 'LOUD' ? 'LOUD' : 'NIP',
        Name: p.name,
        Role: p.role
    })));
}

main().finally(() => prisma.$disconnect());
