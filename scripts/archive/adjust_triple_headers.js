
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { format, startOfDay } = require('date-fns');

async function main() {
    console.log("Starting schedule adjustment for triple-header days...");

    // 1. Fetch all matches, ordered by time
    const matches = await prisma.match.findMany({
        orderBy: { startTime: 'asc' },
        include: { teamA: true, teamB: true }
    });

    if (matches.length === 0) {
        console.log("No matches found.");
        return;
    }

    // 2. Group matches by Date String (YYYY-MM-DD)
    const matchesByDate = {};
    matches.forEach(m => {
        const dateKey = format(m.startTime, 'yyyy-MM-dd');
        if (!matchesByDate[dateKey]) {
            matchesByDate[dateKey] = [];
        }
        matchesByDate[dateKey].push(m);
    });

    // 3. Process groups with exactly 3 LPL matches
    for (const [date, dailyMatches] of Object.entries(matchesByDate)) {
        // Filter for matches where tournament allows (assuming all in DB are LPL for now according to user, 
        // but diagnosis showed Gen.G vs DRX which is LCK. So we MUST filter by tournament or team region)

        // Let's filter by tournament name containing "LPL" or "Season" or standardizing.
        // Or simply checks if the teams are LPL teams? 
        // Diagnosis showed: LGD (LPL), UP (LPL), IG (LPL), AL (LPL), WBG (LPL), BLG (LPL)
        // Gen.G (LCK), DRX (LCK).

        // Filter: Keep only matches where at least one team region is 'CN' or tournament is 'LPL'
        // Just checking tournament might be safer if populated correctly.
        // Let's rely on the user request "2026 LPL 第一赛段". 

        const lplMatches = dailyMatches.filter(m =>
            (m.tournament && m.tournament.includes("LPL")) ||
            (m.teamA.region === 'CN' && m.teamB.region === 'CN')
        );

        if (lplMatches.length === 3) {
            console.log(`\nFound LPL Triple Header on ${date}:`);

            // Expected times: 15:00, 17:00, 19:00
            // dailyMatches is already sorted by time because of the main query orderBy

            // Match 1 -> 15:00
            await updateMatchTime(lplMatches[0], date, 15);
            // Match 2 -> 17:00
            await updateMatchTime(lplMatches[1], date, 17);
            // Match 3 -> 19:00
            await updateMatchTime(lplMatches[2], date, 19);
        }
    }

    console.log("\nAdjustment Complete.");
}

async function updateMatchTime(match, dateStr, hour) {
    // Construct new Date object
    // Note: 'dateStr' is YYYY-MM-DD. Simple append "THH:00:00" might depend on timezone if not careful
    // But since we are operating in local context usually, let's just parse logic.
    // However, Prisma stores in UTC usually. 
    // Safest way: Take original date object, set hours/min/sec

    const newDate = new Date(match.startTime);
    newDate.setHours(hour, 0, 0, 0);

    const oldTimeStr = format(match.startTime, 'HH:mm');
    const newTimeStr = format(newDate, 'HH:mm');

    if (oldTimeStr === newTimeStr) {
        console.log(`  [SKIP] ${match.teamA.name} vs ${match.teamB.name} already at ${newTimeStr}`);
        return;
    }

    console.log(`  [UPDATE] ${match.teamA.name} vs ${match.teamB.name}: ${oldTimeStr} -> ${newTimeStr}`);

    await prisma.match.update({
        where: { id: match.id },
        data: { startTime: newDate }
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
