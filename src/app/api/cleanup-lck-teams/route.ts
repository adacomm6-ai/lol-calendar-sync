
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        console.log("Starting LCK Team Cleanup...");
        const report = [];

        // 1. Delete Kwangdong Freecs (Empty)
        const kdf = await prisma.team.findFirst({ where: { name: "Kwangdong Freecs" } });
        if (kdf) {
            await prisma.team.delete({ where: { id: kdf.id } });
            report.push("Deleted Kwangdong Freecs");
        }

        // 2. Merge FearX -> BNK FEARX
        const oldFox = await prisma.team.findFirst({ where: { name: "FearX" } });
        const newFox = await prisma.team.findFirst({ where: { name: "BNK FEARX" } });

        if (oldFox && newFox) {
            // Update matches
            const matchesA = await prisma.match.updateMany({
                where: { teamAId: oldFox.id },
                data: { teamAId: newFox.id }
            });
            const matchesB = await prisma.match.updateMany({
                where: { teamBId: oldFox.id },
                data: { teamBId: newFox.id }
            });
            report.push(`Migrated ${matchesA.count + matchesB.count} matches from FearX to BNK FEARX`);

            // Delete old
            await prisma.team.delete({ where: { id: oldFox.id } });
            report.push("Deleted FearX");
        }

        // 3. Merge OKSavingsBank BRION -> HANJIN BRION
        const oldBro = await prisma.team.findFirst({ where: { name: "OKSavingsBank BRION" } });
        const newBro = await prisma.team.findFirst({ where: { name: "HANJIN BRION" } });

        if (oldBro && newBro) {
            // Update matches
            const matchesA = await prisma.match.updateMany({
                where: { teamAId: oldBro.id },
                data: { teamAId: newBro.id }
            });
            const matchesB = await prisma.match.updateMany({
                where: { teamBId: oldBro.id },
                data: { teamBId: newBro.id }
            });
            report.push(`Migrated ${matchesA.count + matchesB.count} matches from OKSavingsBank BRION to HANJIN BRION`);

            // Delete old
            await prisma.team.delete({ where: { id: oldBro.id } });
            report.push("Deleted OKSavingsBank BRION");
        }

        return NextResponse.json({ success: true, report });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
