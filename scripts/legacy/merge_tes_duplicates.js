
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:d:/lol-data-system/prisma/dev.db',
        },
    },
});

async function main() {
    console.log('--- Merging Duplicate TES Teams ---');

    // Find teams containing 'TES'
    const teams = await prisma.team.findMany({
        where: {
            OR: [
                { shortName: { contains: 'TES' } },
                { name: { contains: 'TES' } }
            ]
        }
    });

    console.log(`Found ${teams.length} teams containing 'TES'.`);
    teams.forEach(t => console.log(` - ID: ${t.id}, Short: "${t.shortName}", Name: "${t.name}", Region: "${t.region}"`));

    if (teams.length < 2) {
        console.log('Less than 2 teams found. No automatic merge possible.');
        return;
    }

    // Identify target (LPL) and source (Unknown or other)
    // We prefer the one with Region 'LPL'
    let target = teams.find(t => t.region === 'LPL');
    let source = teams.find(t => t.region !== 'LPL');

    // If we have multiple LPL ones or multiple Unknowns, logic gets tricky.
    // Assuming 1 correct LPL and 1 bad Unknown.

    if (!target && teams.length === 2) {
        // If neither has region LPL, pick the one with better metadata?
        // Or simply pick the first one as target?
        target = teams[0];
        source = teams[1];
        console.log("No LPL region found, defaulting to first team as target.");
    }

    if (!target || !source) {
        console.log('Could not cleanly identify Source/Target pair. Aborting to avoid data loss.');
        return;
    }

    if (target.id === source.id) {
        console.log('Target and Source are same ID? Aborting.');
        return;
    }

    console.log(`\nMERGE PLAN:`);
    console.log(`Target (KEEP): ${target.name} (${target.region}, ID: ${target.id})`);
    console.log(`Source (DELETE): ${source.name} (${source.region}, ID: ${source.id})`);

    // Move Matches
    const updateA = await prisma.match.updateMany({
        where: { teamAId: source.id },
        data: { teamAId: target.id }
    });
    console.log(`Moved ${updateA.count} matches (TeamA).`);

    const updateB = await prisma.match.updateMany({
        where: { teamBId: source.id },
        data: { teamBId: target.id }
    });
    console.log(`Moved ${updateB.count} matches (TeamB).`);

    // Move Players
    const updatePlayers = await prisma.player.updateMany({
        where: { teamId: source.id },
        data: { teamId: target.id }
    });
    console.log(`Moved ${updatePlayers.count} players.`);

    // Verify no dependencies left
    const remainingMatches = await prisma.match.count({
        where: { OR: [{ teamAId: source.id }, { teamBId: source.id }] }
    });

    if (remainingMatches === 0) {
        console.log('Deleting Source Team...');
        await prisma.team.delete({ where: { id: source.id } });
        console.log('Success: Duplicate team deleted.');
    } else {
        console.log('Warning: Source team still has matches? Aborting delete.');
    }

}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
