const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const jdgId = 'be6aecf4-09e6-48c8-950a-21e09af4b8a3';

    console.log('Creating HONGQ for Split 1...');
    const newPlayer = await prisma.player.create({
        data: {
            name: 'HONGQ',
            role: 'MID',
            split: 'Split 1',
            teamId: jdgId
        }
    });
    console.log('Created:', newPlayer);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
