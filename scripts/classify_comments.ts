
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting comment classification...");

    // 1. Fetch all matches with their games (to get player stats/names) and comments
    const matches = await prisma.match.findMany({
        include: {
            games: true,
            comments: true
        }
    });

    console.log(`Found ${matches.length} matches.`);

    let updatedCount = 0;

    for (const match of matches) {
        // 2. Collect Player Names for this match
        const playerNames = new Set<string>();

        // From Games (Actual metadata)
        for (const game of match.games) {
            try {
                const teamAStats = JSON.parse(game.teamAStats as string || '[]');
                const teamBStats = JSON.parse(game.teamBStats as string || '[]');

                [...teamAStats, ...teamBStats].forEach((p: any) => {
                    // Extract name from "playerName" or "name"
                    const name = p.playerName || p.name;
                    if (name && typeof name === 'string' && name.length > 2) { // Length check to avoid short matches like "No"
                        playerNames.add(name.toLowerCase());
                    }
                });
            } catch (e) {
                console.warn(`Failed to parse stats for game ${game.id}`);
            }
        }

        // Also maybe fetch from Team roster if needed? 
        // For now, game stats is the most accurate source for who played.

        if (playerNames.size === 0) {
            console.log(`No player data found for Match ${match.id}, skipping classification logic for detailed names, but may default to SUMMARY_FLOW.`);
            // Only convert if we are sure? Or just skip?
            // User said "Filter all".
            // If we don't know players, we can't safely put in PLAYER_ANALYSIS.
            // So everything goes to SUMMARY_FLOW?
            // Let's rely on content check.
        }

        console.log(`Match ${match.id} - Found players: ${Array.from(playerNames).join(', ')}`);

        // 3. Classify Comments
        for (const comment of match.comments) {
            // Skip if already classified? User said "Filter ALL historical". 
            // Maybe we strictly overwrite 'POST_MATCH' (legacy default) and keep existing specific ones?
            // "将包含有选手ID的分析评论放入选手对位分析中，其余的放入赛后分析"
            // Suggests a re-sweep. I will process ALL comments to be safe, or maybe just 'POST_MATCH' and 'GAME_SUMMARY'?
            // Let's process everything to ensure consistency.

            const contentLower = comment.content.toLowerCase();
            let newType = 'SUMMARY_FLOW'; // Default to "Post-Match Analysis" (Flow section)

            // Check for player names
            let mentionedPlayer = false;
            for (const name of Array.from(playerNames)) {
                // simple includes check
                if (contentLower.includes(name)) {
                    mentionedPlayer = true;
                    break;
                }
            }

            if (mentionedPlayer) {
                newType = 'PLAYER_ANALYSIS';
            }

            // Only update if changed
            if (comment.type !== newType) {
                await prisma.comment.update({
                    where: { id: comment.id },
                    data: { type: newType }
                });
                updatedCount++;
                // console.log(`Updated Comment ${comment.id}: ${comment.type} -> ${newType}`);
            }
        }
    }

    console.log(`Classification complete. Updated ${updatedCount} comments.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
