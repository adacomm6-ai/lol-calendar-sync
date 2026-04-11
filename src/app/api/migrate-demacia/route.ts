
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        // Update all existing matches (which are the 7 imported ones) 
        // to Tournament: "2026 德玛西亚杯", Stage: "淘汰赛"
        const result = await prisma.match.updateMany({
            where: {}, // Update ALL matches currently in DB
            data: {
                tournament: "2026 德玛西亚杯",
                stage: "淘汰赛"
            }
        });

        return NextResponse.json({
            success: true,
            count: result.count,
            message: "Updated matches to Demacia Cup Knockout Stage"
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}
