import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Find Teams
    const ig = await prisma.team.findFirst({ where: { name: 'Invictus Gaming' } });
    const tes = await prisma.team.findFirst({ where: { OR: [{ name: 'TES' }, { shortName: 'TES' }] } });

    if (!ig || !tes) {
        console.log("Teams not found");
        return;
    }

    console.log(`IG ID: ${ig.id}`);
    console.log(`TES ID: ${tes.id}`);

    // Find Matches
    const matches = await prisma.match.findMany({
        where: {
            OR: [
                { teamAId: ig.id, teamBId: tes.id },
                { teamAId: tes.id, teamBId: ig.id }
            ],
        },
        include: {
            teamA: true,
            teamB: true,
            games: true
        }
    });

    console.log(`Found ${matches.length} matches between IG and TES:`);
    matches.forEach(m => {
        console.log(`\nMatch ID: ${m.id}`);
        console.log(`  Date: ${m.startTime} (Local Str: ${m.startTime?.toLocaleString() || 'TBD'})`);
        console.log(`  Teams: ${m.teamA?.name || 'TBD'} vs ${m.teamB?.name || 'TBD'}`);
        console.log(`  Games Count: ${m.games.length}`);
        console.log(`  Winner: ${m.winnerId}`);
        console.log(`  Status: ${m.status}`);
    });
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
