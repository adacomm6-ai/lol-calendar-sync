const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    const m1 = await p.match.findFirst({
        where: {
            teamA: { shortName: 'WBG' },
            teamB: { shortName: 'IG' }
        },
        include: { teamA: true, teamB: true }
    });

    const m2 = await p.match.findFirst({
        where: {
            teamA: { shortName: 'LGD' },
            teamB: { shortName: 'UP' }
        },
        include: { teamA: true, teamB: true }
    });

    console.log("WBG vs IG:", m1?.startTime, "ISO:", m1?.startTime?.toISOString());
    console.log("LGD vs UP:", m2?.startTime, "ISO:", m2?.startTime?.toISOString());
}

main().catch(console.error).finally(() => p.$disconnect());
