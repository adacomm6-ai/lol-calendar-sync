import { prisma } from '@/lib/db';
import BracketViewer from '@/components/admin/BracketViewer';
import BracketManagerClient from '@/app/admin/bracket/BracketManagerClient';

export const dynamic = "force-dynamic";

// Server Component to fetch initial data
export default async function BracketPage() {
    const teams = await prisma.team.findMany({
        orderBy: { shortName: 'asc' },
        select: { id: true, name: true, shortName: true, region: true }
    });

    // Get list of tournaments for dropdown
    const tournamentGroups = await prisma.match.groupBy({
        by: ['tournament'],
        orderBy: { tournament: 'desc' }
    });
    const tournaments = tournamentGroups.map(t => t.tournament).filter(Boolean);

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">Tournament Brackets</h1>
            <BracketManagerClient teams={teams} tournaments={tournaments} />
        </div>
    );
}
