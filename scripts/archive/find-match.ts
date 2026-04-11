
import { prisma } from '@/lib/db';

async function findMatch() {
    const teams = await prisma.team.findMany({
        where: {
            OR: [
                { name: { contains: 'IG' } },
                { shortName: { contains: 'IG' } },
                { name: { contains: 'TES' } },
                { shortName: { contains: 'TES' } },
                { name: { contains: 'Invictus' } },
                { name: { contains: 'Top' } }
            ]
        }
    });

    console.log('Found Teams:', teams.map(t => `${t.name} (${t.id})`));

    const teamIds = teams.map(t => t.id);

    const matches = await prisma.match.findMany({
        where: {
            teamAId: { in: teamIds },
            teamBId: { in: teamIds }
        },
        include: {
            teamA: true,
            teamB: true
        }
    });

    console.log('Found Matches:', matches.map(m => `${m.id}: ${m.teamA?.name || 'TBD'} vs ${m.teamB?.name || 'TBD'} @ ${m.startTime}`));
}

findMatch();
