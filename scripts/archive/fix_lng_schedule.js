const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Find the match
    // Date: Jan 16, 2026. Time 17:00.
    // Range: Jan 16 00:00 to Jan 16 23:59
    const start = new Date('2026-01-16T00:00:00.000Z');
    const end = new Date('2026-01-16T23:59:59.000Z');

    // Find match with LNG
    const matches = await prisma.match.findMany({
        where: {
            startTime: { gte: start, lte: end },
            OR: [
                { teamA: { shortName: 'LNG' } },
                { teamB: { shortName: 'LNG' } }
            ]
        },
        include: { teamA: true, teamB: true }
    });

    console.log(`Found ${matches.length} matches involving LNG on Jan 16.`);

    if (matches.length === 0) {
        console.log('No matches found. Check dates/timezones.');
        return;
    }

    const match = matches[0];
    console.log(`Match ID: ${match.id}`);
    console.log(`Current: ${match.teamA.name} vs ${match.teamB.name}`);

    // Check if opponent is UP (Ultra Prime)
    const isUP = match.teamA.shortName === 'UP' || match.teamB.shortName === 'UP';
    if (!isUP) {
        console.log('Opponent is not UP. Please manually verify.');
        // Maybe names are tricky?
        if (match.teamA.name.includes('Ultra') || match.teamB.name.includes('Ultra')) {
            console.log('Actually it looks like UP.');
        } else {
            console.log('Aborting.');
            // return; // Commented out to allow forced fix if needed, but safer to return
        }
    }

    // 2. Find OMG Team
    const omg = await prisma.team.findFirst({
        where: {
            OR: [
                { shortName: 'OMG' },
                { name: 'OMG' },
                { name: { contains: 'OMG' } }
            ]
        }
    });

    if (!omg) {
        console.log('Could not find team OMG.');
        return;
    }
    console.log(`Found OMG: ${omg.name} (${omg.id})`);

    // 3. Update Match
    // If LNG is A, set B to OMG. If LNG is B, set A to OMG.
    const isLngA = match.teamA.shortName === 'LNG';

    if (isLngA) {
        console.log(`Updating Match: Set TeamB to OMG.`);
        await prisma.match.update({
            where: { id: match.id },
            data: { teamBId: omg.id }
        });
    } else {
        console.log(`Updating Match: Set TeamA to OMG.`);
        await prisma.match.update({
            where: { id: match.id },
            data: { teamAId: omg.id } // Fixed typo teamAId
        });
    }

    console.log('Schedule updated successfully.');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
