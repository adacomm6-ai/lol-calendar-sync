const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const furia = await prisma.team.findFirst({
        where: { name: 'FURIA' },
        include: { players: true }
    });

    if (!furia) {
        console.log('FURIA not found locally');
        return;
    }

    console.log(`FURIA ID: ${furia.id}`);
    console.log('FURIA Players:');
    console.table(furia.players.map(p => ({ name: p.name, role: p.role })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
