
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const teams = await prisma.team.findMany({
            where: { region: "LCK" },
            include: { _count: { select: { matchesAsA: true, matchesAsB: true, players: true } } }
        });

        return NextResponse.json({
            count: teams.length,
            teams: teams.map(t => ({
                id: t.id,
                name: t.name,
                shortName: t.shortName,
                matchCount: t._count.matchesAsA + t._count.matchesAsB,
                playerCount: t._count.players
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
