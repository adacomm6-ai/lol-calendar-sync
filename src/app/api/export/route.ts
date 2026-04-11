
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        const matches = await prisma.match.findMany({
            include: {
                games: true,
                teamA: true,
                teamB: true,
                comments: true,
                odds: true
            },
            orderBy: { startTime: 'desc' }
        });

        const data = JSON.stringify(matches, null, 2);

        return new NextResponse(data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="lol_matches_backup_${new Date().toISOString().split('T')[0]}.json"`
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
