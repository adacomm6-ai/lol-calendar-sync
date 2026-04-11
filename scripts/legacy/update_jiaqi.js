const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const p = await prisma.player.update({
        where: { name: 'JIAQI' }, // name is unique? Wait. ID is better.
        // I have ID from previous step: c85aea71-268a-427d-a6a2-1f5b5039bf86
        // But Name should work if unique constraint exists. Schema usually has unique name? 
        // Actually Schema `name` is unique?
        // Let's use ID to be safe if I can copy paste?
        // Or Name since I just queried it.
        data: { split: 'Split 1' }
    });
    // Wait. player update requires where unique.
    // If name is NOT unique in schema, I might fail.
    // I know ID is c85aea71...
    // I will use findFirst then update using ID.
}

async function safeUpdate() {
    const p = await prisma.player.findFirst({ where: { name: 'JIAQI' } });
    if (p) {
        await prisma.player.update({
            where: { id: p.id },
            data: { split: 'Split 1' }
        });
        console.log("Updated JIAQI to Split 1");
    } else {
        console.log("JIAQI not found");
    }
}

safeUpdate();
