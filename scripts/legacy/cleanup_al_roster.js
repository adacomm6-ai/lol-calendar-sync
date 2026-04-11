const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Define AL Demacia Cup players to remove from Split 1
    // Keep: Flandre, Tarzan, Shanks, Hope, Kael
    // Remove: YINOVA, GLFS, SINIAN, THEHANG, WUNAI3 (and duplicate WUNAI3)

    // Target Team: AL
    const team = await prisma.team.findFirst({
        where: { shortName: 'AL' }
    });

    if (!team) {
        console.log('Team AL not found.');
        return;
    }

    const removeList = ['YINOVA', 'GLFS', 'SINIAN', 'THEHANG', 'WUNAI3'];

    console.log(`Cleaning up AL (${team.id}) Split 1 roster...`);
    console.log(`Targets: ${removeList.join(', ')}`);

    const result = await prisma.player.deleteMany({
        where: {
            teamId: team.id,
            split: 'Split 1',
            name: { in: removeList } // deleting by name matches
        }
    });

    console.log(`Deleted ${result.count} player records.`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
