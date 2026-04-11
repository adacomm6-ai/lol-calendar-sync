import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const LCK_LOGO_MAP: Record<string, string> = {
    'T1': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/fc/T1logo_std.png/revision/latest?cb=20230512040324',
    'Gen.G': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3b/Gen.Glogo_std.png/revision/latest?cb=20210806133431',
    'Hanwha Life Esports': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e9/Hanwha_Life_Esportslogo_std.png/revision/latest?cb=20211024145236',
    'Dplus KIA': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/fc/Dplus_KIAlogo_std.png/revision/latest?cb=20230512050615',
    'KT Rolster': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/c8/KT_Rolsterlogo_std.png/revision/latest?cb=20260105105759',
    'BNK FEARX': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3c/BNK_FEARXlogo_std.png/revision/latest?cb=20241225073827',
    'DN SOOPers': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/2/26/DN_SOOPerslogo_std.png/revision/latest?cb=20251222013205',
    'HANJIN BRION': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/1/1e/BRIONlogo_std.png/revision/latest?cb=20230518062824',
    'Nongshim RedForce': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/01/Nongshim_RedForcelogo_std.png/revision/latest?cb=20260109024626',
    'KRX': 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/58/DRXlogo_std.png/revision/latest?cb=20230504052509',
};

export async function GET() {
    try {
        const reports: string[] = [];

        for (const [name, logo] of Object.entries(LCK_LOGO_MAP)) {
            const team = await prisma.team.findFirst({
                where: { name },
                select: { id: true },
            });

            if (!team) {
                reports.push(`Skipped ${name} (Not found)`);
                continue;
            }

            await prisma.team.update({
                where: { id: team.id },
                data: { logo },
            });
            reports.push(`Updated ${name}`);
        }

        return NextResponse.json({
            success: true,
            message: 'LCK Logo Audit Complete',
            details: reports,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
