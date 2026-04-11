
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting diagnostics...");

    // 1. Check for [red] tags
    const taggedComments = await prisma.comment.findMany({
        where: {
            content: { contains: '[red]' }
        }
    });
    console.log(`\nFound ${taggedComments.length} comments with '[red]' tags.`);
    if (taggedComments.length > 0) {
        console.log("Samples:");
        taggedComments.slice(0, 3).forEach(c => console.log(`- ID ${c.id}: ${c.content}`));
    }

    // 2. Check for Orphaned Comments (Game Number validity)
    // We assume gameNumber 1, 2, 3... are valid if the match exists?
    // Let's check match existence.
    const allComments = await prisma.comment.findMany({
        include: { match: { include: { games: true } } }
    });

    let missingGameCount = 0;
    let commentsWithNoMatch = 0;

    for (const c of allComments) {
        if (!c.match) {
            commentsWithNoMatch++;
            continue;
        }

        // Check if gameNumber exists in match.games
        // Note: gameNumber is 1-based index usually.
        // match.games has gameNumber field.
        const gameExists = c.match.games.some(g => g.gameNumber === c.gameNumber);

        if (!gameExists) {
            // It might be a generic comment (gameNumber 0?)
            // If gameNumber is valid (>=1) but game doesn't exist, it's "missing context".
            if (!c.gameNumber || c.gameNumber < 1) {
                // Maybe intended as match-level comment?
            } else {
                console.log(`- Orphaned Comment ${c.id}: Match ${c.matchId} has games [${c.match.games.map(g => g.gameNumber).join(',')}] but comment is for Game ${c.gameNumber}`);
                missingGameCount++;
            }
        }
    }

    console.log(`\nDiagnostics Summary:`);
    console.log(`- Total Comments: ${allComments.length}`);
    console.log(`- Comments with '[red]': ${taggedComments.length}`);
    console.log(`- Comments with NO Match: ${commentsWithNoMatch}`);
    console.log(`- Comments with Invalid Game # (Orphaned): ${missingGameCount}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
