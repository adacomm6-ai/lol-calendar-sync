const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function countPlayers() {
    const count = await prisma.player.count();
    console.log("Total Players:", count);

    const pAll = await prisma.player.findMany();
    console.log("findMany() without args returns rows:", pAll.length);

    const fIG = pAll.find(p => p.name.includes("Flandre") && p.teamId === '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a');
    console.log("Does findMany() contain Flandre IG?", !!fIG);
}
countPlayers().finally(() => prisma.$disconnect());
