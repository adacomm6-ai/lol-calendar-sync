const { prisma } = require('../src/lib/db');
const { propagateMatchResult } = require('../src/lib/bracket-utils');

async function main() {
    console.log('--- Starting Bracket Logic Test ---');

    // 1. Create Teams
    const teams = await prisma.team.findMany({ take: 2 });
    if (teams.length < 2) {
        console.error('Not enough teams to test');
        return;
    }
    const t1 = teams[0];
    const t2 = teams[1];
    console.log(`Using Teams: ${t1.shortName} vs ${t2.shortName}`);

    // 2. Create Parent Match (Match A)
    const matchA = await prisma.match.create({
        data: {
            startTime: new Date(),
            teamAId: t1.id,
            teamBId: t2.id,
            status: 'SCHEDULED',
            format: 'BO3',
            tournament: 'Test Cup',
            stage: 'Round 1'
        }
    });
    console.log(`Created Parent Match A: ${matchA.id}`);

    // 3. Create Child Match (Match B) - dependent on Match A Winner
    const matchB = await prisma.match.create({
        data: {
            startTime: new Date(Date.now() + 86400000), // Tomorrow
            status: 'SCHEDULED',
            format: 'BO3',
            tournament: 'Test Cup',
            stage: 'Round 2',
            teamAParentMatchId: matchA.id,
            teamAParentType: 'WINNER'
            // Team B stays null/TBD
        }
    });
    console.log(`Created Child Match B: ${matchB.id} (Waiting for Winner of A)`);

    // 4. Verify initial state of Match B
    let checkB = await prisma.match.findUnique({ where: { id: matchB.id } });
    if (checkB?.teamAId) {
        console.error('FAIL: Match B should have null Team A initially');
    } else {
        console.log('PASS: Match B initially has TBD Team A');
    }

    // 5. Update Match A result (Finish)
    // Simulate what actions.ts does
    const winnerId = t1.id;
    await prisma.match.update({
        where: { id: matchA.id },
        data: {
            status: 'FINISHED',
            winnerId: winnerId
        }
    });
    console.log(`Match A Finished. Winner: ${t1.shortName}`);

    // 6. Trigger Propagation manually (since we are not running via action)
    console.log('Triggering Propagation...');
    await propagateMatchResult(matchA.id);

    // 7. Verify Match B update
    checkB = await prisma.match.findUnique({ where: { id: matchB.id } });
    if (checkB?.teamAId === winnerId) {
        console.log('PASS: Match B Team A automatically updated to Winner of A!');
    } else {
        console.error(`FAIL: Match B Team A is ${checkB?.teamAId}, expected ${winnerId}`);
    }

    // Cleanup
    await prisma.match.deleteMany({ where: { id: { in: [matchA.id, matchB.id] } } });
    console.log('Cleanup Done.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
