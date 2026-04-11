import { prisma } from './db';

/**
 * Propagates the result of a match to any future matches that depend on it.
 * e.g. If Match A's winner goes to Match B's Team A, this updates Match B.
 */
export async function propagateMatchResult(matchId: string) {
    if (!matchId) return;

    try {
        // [ROLLBACK] Logic disabled temporarily due to DB maintenance
        return;
        /*
        // 1. Get the completed match result
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { teamA: true, teamB: true }
        });

        if (!match || !match.winnerId) {
            console.log(`[Bracket] Match ${matchId} has no winner yet. Skipping propagation.`);
            return;
        }

        const winnerId = match.winnerId;
        const loserId = match.teamAId === winnerId ? match.teamBId : match.teamAId;

        // 2. Find any matches waiting for this result
        // We look for matches where teamAParentMatchId OR teamBParentMatchId is this match
        const childMatches = await prisma.match.findMany({
            where: {
                OR: [
                    { teamAParentMatchId: matchId },
                    { teamBParentMatchId: matchId }
                ]
            }
        });

        if (childMatches.length === 0) {
            return;
        }

        console.log(`[Bracket] Propagating result of ${matchId} (Winner: ${winnerId}) to ${childMatches.length} matches.`);

        // 3. Update each child match
        for (const child of childMatches) {
            const dataToUpdate: any = {};

            // Check Team A dependency
            if (child.teamAParentMatchId === matchId) {
                const type = child.teamAParentType || 'WINNER';
                if (type === 'WINNER') {
                    dataToUpdate.teamAId = winnerId;
                } else if (type === 'LOSER') {
                    dataToUpdate.teamAId = loserId;
                }
            }

            // Check Team B dependency
            if (child.teamBParentMatchId === matchId) {
                const type = child.teamBParentType || 'WINNER';
                if (type === 'WINNER') {
                    dataToUpdate.teamBId = winnerId;
                } else if (type === 'LOSER') {
                    dataToUpdate.teamBId = loserId;
                }
            }

            if (Object.keys(dataToUpdate).length > 0) {
                await prisma.match.update({
                    where: { id: child.id },
                    data: dataToUpdate
                });
                console.log(`[Bracket] Updated Match ${child.id}: set ${JSON.stringify(dataToUpdate)}`);

                // Recursively propagate? 
                // If the child match became fully populated and somehow auto-resolved (rare), or if we want to check readiness.
                // For now, minimal propagation is enough. 
                // If a match is updated, it doesn't get a winner automatically, so recursion stops here.
            }
        }
        */
    } catch (e) {
        console.error(`[Bracket] Error propagating match ${matchId}:`, e);
    }
}
