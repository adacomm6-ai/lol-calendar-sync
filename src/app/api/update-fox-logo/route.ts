
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        console.log("Updating BNK FEARX Logo...");

        // Use the 'profile' version which is often better optimized for icons
        const logo = "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/0f/BNK_FEARXlogo_profile.png";

        await prisma.team.updateMany({
            where: { name: "BNK FEARX" },
            data: { logo: logo }
        });

        return NextResponse.json({
            success: true,
            message: "BNK FEARX Logo Updated",
            logo: logo
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
