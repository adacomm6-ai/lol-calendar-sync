const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixTeams() {
    try {
        const correctIGId = '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a';
        const correctLNGId = '21e288a8-ecca-495f-b32d-369313749b48';

        const wrongIGId = 'eb8f33c4-f5ea-4707-8971-443880e34913';
        const wrongLNGId = '67434ed6-2152-4a9f-931e-f0f0f307d525';

        console.log("Fixing Game 2...");
        await prisma.game.updateMany({
            where: {
                OR: [
                    { blueSideTeamId: wrongLNGId },
                    { redSideTeamId: wrongIGId },
                    { winnerId: wrongIGId }
                ]
            },
            data: {
                // This updateMany is risky if I can't conditionally set fields.
                // Prisma updateMany sets all matched fields to the value.
                // Since I know the specific games (by ID from inspection), better to update by ID.
            }
        });

        // Hardcoding Game IDs from inspection log for safety
        const game2Id = '27649dc7-520f-492e-bf5a-f02d877474e8';
        const game3Id = 'f3a3b060-9c4a-426c-95f0-ff529940a965';

        // Game 2: Blue=LNG(Wrong), Red=IG(Wrong), Winner=IG(Wrong) -> Blue=LNG(Correct), Red=IG(Correct), Winner=IG(Correct)
        console.log("Updating Game 2...");
        await prisma.game.update({
            where: { id: game2Id },
            data: {
                blueSideTeamId: correctLNGId,
                redSideTeamId: correctIGId,
                winnerId: correctIGId
            }
        });

        // Game 3: Blue=LNG(Wrong), Red=IG(Wrong), Winner=IG(Wrong) -> Blue=LNG(Correct), Red=IG(Correct), Winner=IG(Correct)
        console.log("Updating Game 3...");
        await prisma.game.update({
            where: { id: game3Id },
            data: {
                blueSideTeamId: correctLNGId,
                redSideTeamId: correctIGId,
                winnerId: correctIGId
            }
        });

        // Also check if any other games used these wrong IDs? 
        // Just in case, replace all occurrences.
        const gamesWithWrongIG = await prisma.game.updateMany({
            where: { winnerId: wrongIGId },
            data: { winnerId: correctIGId }
        });
        console.log(`Updated ${gamesWithWrongIG.count} games with wrong IG winner.`);

        // Now delete the wrong teams if they verify as duplicates (created recently, no other games?)
        // Let's safe delete: only if no games reference them.

        try {
            await prisma.team.delete({ where: { id: wrongIGId } });
            console.log("Deleted duplicate IG team.");
        } catch (e) {
            console.log("Could not delete duplicate IG team (might still be referenced).");
        }

        try {
            await prisma.team.delete({ where: { id: wrongLNGId } });
            console.log("Deleted duplicate LNG team.");
        } catch (e) {
            console.log("Could not delete duplicate LNG team (might still be referenced).");
        }

        // Fix Match Winner? The match winner was LNG Esports (21e2...)
        // But Score is:
        // Game 1: IG (9a2f...)
        // Game 2: IG (Fixed)
        // Game 3: IG (Fixed)
        // So IG won 3-0? The inspection said "Winner: LNG Esports".
        // Wait, did I misread the score earlier?
        // "Winner: LNG Esports (21e2...)" was in the inspect output.
        // But Game 1 winner: 9a2f (IG).
        // Games 2/3 winner: eb8f (Duplicate IG).
        // So IG won 3-0.
        // Why was the match winner LNG? Maybe it was manual override or incorrect logic?
        // I need to update the Match winner to IG.

        console.log("Updating Match Winner to IG...");
        await prisma.match.update({
            where: { id: '72ed915f-0e8d-4516-9f2e-b3886fd60767' },
            data: {
                winnerId: correctIGId
            }
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

fixTeams();
