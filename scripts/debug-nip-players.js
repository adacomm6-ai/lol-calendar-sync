const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teams = await prisma.team.findMany({
        where: {
            OR: [
                { id: '0d900a1a-c0fc-4965-83c6-cc9844700ca1' },
                { name: { contains: 'Ninjas' } },
                { shortName: 'NIP' }
            ]
        }
    });
    console.log('--- Teams Found ---');
    console.table(teams.map(t => ({ id: t.id, name: t.name, region: t.region })));

    const teamIds = teams.map(t => t.id);

    const players = await prisma.player.findMany({
        where: {
            teamId: { in: teamIds }
        },
        orderBy: { role: 'asc' }
    });

    console.log('\n--- Players Found ---');
    console.table(players.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        teamId: p.teamId,
        split: p.split
    })));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
