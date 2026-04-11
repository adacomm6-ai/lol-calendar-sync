const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    console.log("Fetching all matches with a startTime...");
    const matches = await p.match.findMany({
        where: {
            startTime: { not: null }
        }
    });

    console.log(`Found ${matches.length} matches to update.`);

    let updated = 0;
    for (const match of matches) {
        // Add 8 hours to the UTC time
        const oldTime = new Date(match.startTime);
        const newTime = new Date(oldTime.getTime() + 8 * 60 * 60 * 1000);

        await p.match.update({
            where: { id: match.id },
            data: { startTime: newTime }
        });
        updated++;
        if (updated % 50 === 0) {
            console.log(`Updated ${updated} matches...`);
        }
    }

    console.log(`Successfully shifted ${updated} matches forward by 8 hours.`);
}

main()
    .catch(console.error)
    .finally(() => p.$disconnect());
