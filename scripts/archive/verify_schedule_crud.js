
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- START SCHEDULE CRUD VERIFICATION ---');

    // 1. Setup Data
    let teamA = await prisma.team.findFirst({ where: { shortName: 'T1' } });
    if (!teamA) teamA = await prisma.team.findFirst();
    let teamB = await prisma.team.findFirst({ where: { shortName: 'GEN' } });
    if (!teamB) teamB = (await prisma.team.findMany())[1];

    if (!teamA || !teamB) {
        console.error('FAIL: Not enough teams to test match creation.');
        return;
    }
    console.log(`Using Teams: ${teamA.shortName} vs ${teamB.shortName}`);

    // 2. Test Create (Upsert)
    console.log('Testing Create...');
    const matchId = 'test-match-' + Date.now();
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 24); // Tomorrow

    const payload = {
        id: matchId,
        startTime: startTime,
        teamAId: teamA.id,
        teamBId: teamB.id,
        status: 'SCHEDULED',
        format: 'BO3',
        tournament: 'Test LCK',
        stage: 'Groups'
    };

    try {
        await prisma.match.create({ data: payload });
        console.log('Create Success.');
    } catch (e) {
        console.error('Create Failed:', e);
        return;
    }

    // 3. Test Read (Search Logic)
    console.log('Testing Search...');
    const found = await prisma.match.findUnique({ where: { id: matchId } });
    if (found && found.tournament === 'Test LCK') {
        console.log('Read Success.');
    } else {
        console.error('Read Failed: Match not found or incorrect data.');
    }

    // 4. Test Update
    console.log('Testing Update...');
    try {
        await prisma.match.update({
            where: { id: matchId },
            data: { status: 'LIVE', stage: 'Playoffs' }
        });
        const updated = await prisma.match.findUnique({ where: { id: matchId } });
        if (updated.status === 'LIVE' && updated.stage === 'Playoffs') {
            console.log('Update Success.');
        } else {
            console.error('Update Verified Failed:', updated);
        }
    } catch (e) {
        console.error('Update Failed:', e);
    }

    // 5. Test Delete
    console.log('Testing Delete...');
    try {
        await prisma.match.delete({ where: { id: matchId } });
        const deleted = await prisma.match.findUnique({ where: { id: matchId } });
        if (!deleted) {
            console.log('Delete Success.');
        } else {
            console.error('Delete Failed: Match still exists.');
        }
    } catch (e) {
        console.error('Delete Exception:', e);
    }

    console.log('--- VERIFICATION COMPLETE ---');
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
