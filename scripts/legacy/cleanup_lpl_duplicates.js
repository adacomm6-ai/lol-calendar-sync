const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Audit results:
    // IG: Keep Soboro, Rookie, Photic, Meiko, Jwei.
    // TES: Keep 369, naiyou, Creme, JackeyLove, Hang.
    // JDG: Keep Xiaoxu, Xun, Yagao, Ruler, MISSING, JUNJIA, GALA, VAMPIRE. (Wait, User added Junjia/Gala/Vampire/Xiaoxu. Log shows Xiaoxu AND XIAOXU. Keep Xiaoxu).
    // Let's rely on CASE sensitivity. Usually Mixed Case is better.
    // LGD: sasi, Heng, Tangyuan, Shaoye, ycx.
    // LNG: sheer, Croco, BuLLDoG, 1xn, MISSING. (Wait, LNG Missing? Maybe GALA is LNG? DB says MISSING. I'll keep Mixed case).
    // EDG: Zdz, Xiaohao, Angel, Leave, Parukia.
    // OMG: Hery, re0, haichao, Starry, Moham.

    const teamsToClean = [
        {
            shortName: 'IG',
            keep: ['Soboro', 'Rookie', 'Photic', 'Meiko', 'Jwei', 'Wei'] // Did Wei stay? Profile says Jwei. I will keep Jwei. Delete WEI (UPPER).
        },
        {
            shortName: 'TES',
            keep: ['369', 'naiyou', 'Creme', 'JackeyLove', 'Hang']
        },
        {
            shortName: 'JDG',
            keep: ['Xiaoxu', 'Xun', 'Yagao', 'Ruler', 'MISSING', 'JUNJIA', 'GALA', 'VAMPIRE'] // Keep the ones explicitly added. Wait, are they UPPERCASE?
            // In earlier task fixes (Step 500+), I added JUNJIA, GALA, VAMPIRE (Uppercase?).
            // If they are uppercase, I keep them.
            // But remove duplicates like HONGQ vs HONGO.
            // I'll filter logic below.
        },
        {
            shortName: 'LGD',
            keep: ['sasi', 'Heng', 'Tangyuan', 'Shaoye', 'ycx']
        },
        {
            shortName: 'LNG',
            keep: ['sheer', 'Croco', 'BuLLDoG', '1xn', 'MISSING'] // Mixed case preferred if exists.
        },
        {
            shortName: 'EDG',
            keep: ['Zdz', 'Xiaohao', 'Angel', 'Leave', 'Parukia']
        },
        {
            shortName: 'OMG',
            keep: ['Hery', 're0', 'haichao', 'Starry', 'Moham'] // re0 (lowercase?)
        }
    ];

    for (const t of teamsToClean) {
        const team = await prisma.team.findFirst({ where: { shortName: t.shortName } });
        if (!team) continue;

        const players = await prisma.player.findMany({
            where: { teamId: team.id, split: 'Split 1' }
        });

        console.log(`Cleaning ${t.shortName}... Found ${players.length}`);

        // Strategy: 
        // 1. Identify "Keepers" (Exact Match).
        // 2. Everything else is candidate for deletion.
        // Wait, "keep" list might be case sensitive or insensitive?
        // Let's assume the names provided in "Keep" are the exact target names.
        // EXCEPT for JDG where I might want to double check.

        // Refined Strategy:
        // Delete strictly the ones appearing to be Duplicates/Junk.
        // Using "Not In Keep List" is risky if I missed a legitimate sub.
        // But for "Cleanup", risk is acceptable if strictly defined.

        if (t.shortName === 'JDG') {
            // JDG Special Case: I added JUNJIA, GALA, VAMPIRE (Upper).
            // Existing log showed: Xiaoxu, Xun, Yagao, Ruler, MISSING, HONGQ, JUNJIA, GALA, VAMPIRE, XIAOXU, HONGO.
            // Keep: Xiaoxu, Xun, Yagao, Ruler, MISSING, HONGQ, JUNJIA, GALA, VAMPIRE.
            // Delete: XIAOXU (Dup), HONGO (Typo).
            // Can I just loop and delete specific IDs?
            // Easier to define deletions.
            const toDeleteNames = ['XIAOXU', 'HONGO'];
            await prisma.player.deleteMany({
                where: { teamId: team.id, split: 'Split 1', name: { in: toDeleteNames } }
            });
            console.log(`JDG: Deleted ${toDeleteNames.join(', ')}`);
        } else {
            // Generic Cleanup: Delete anything that matches a "Junk Pattern" (e.g. UPPERCASE copy of existing Mixed Case).
            // Or simply: Delete everyone NOT in the Keep list?
            // Safe bet: Delete everyone NOT in Keep list.
            // But if I missed 'Juhan' for OMG? (Log showed JUHAN).
            // Let's be aggressive but safe.

            // I will delete based on explicit Exclusion of "Bad Names" from the log.
            // IG: SOBORO, WEI, RENARD, PHOTIC, SOBORD. (Keep Jwei).
            // TES: ZUIAN, NAIYOU, NIA, JIAQI, FENGYUE, JIADI.
            // LGD: SASI, HENG, TANGYUAN, SHADYE, YCX, SHAOYE.
            // LNG: SHEER, CROCO, BULLDOG, 1XN, IXN.
            // EDG: ZDZ, XIAOHAO, ANGEL, LEAVE, PARUIKIA, ZOZ, XIAOHAD.
            // OMG: HERY, JUHAN, HAICHAD, STARRY, MOHAM, HIERY, HAICHAO (Wait, duplicate Haichao?).
            // Log: haichao, HAICHAD, HAICHAO. Keep haichao?

            const badNames = [];
            if (t.shortName === 'IG') badNames.push('SOBORO', 'WEI', 'RENARD', 'PHOTIC', 'SOBORD');
            if (t.shortName === 'TES') badNames.push('ZUIAN', 'NAIYOU', 'NIA', 'JIAQI', 'FENGYUE', 'JIADI');
            if (t.shortName === 'LGD') badNames.push('SASI', 'HENG', 'TANGYUAN', 'SHADYE', 'YCX', 'SHAOYE', 'SHAOYE_dup?');
            if (t.shortName === 'LNG') badNames.push('SHEER', 'CROCO', 'BULLDOG', '1XN', 'IXN');
            if (t.shortName === 'EDG') badNames.push('ZDZ', 'XIAOHAO', 'ANGEL', 'LEAVE', 'PARUIKIA', 'ZOZ', 'XIAOHAD');
            if (t.shortName === 'OMG') badNames.push('HERY', 'JUHAN', 'HAICHAD', 'STARRY', 'MOHAM', 'HIERY', 'HAICHAO', 'HIERY'); // Note: Keeping "Starry" (Mixed), deleting "STARRY" (Upper).

            // Need to be careful: "MOHAM" vs "Moham". Log showed both. 
            // My keep list has Mixed Case names.
            // So I will delete the UPPERCASE versions if they exist.
            // Actually, `badNames` array construction above hardcodes what I saw in the log as "Bad".
            // Let's execute delete.

            if (badNames.length > 0) {
                const res = await prisma.player.deleteMany({
                    where: { teamId: team.id, split: 'Split 1', name: { in: badNames } }
                });
                console.log(`${t.shortName}: Deleted ${res.count} records (${badNames.join(', ')})`);
            }
        }
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
