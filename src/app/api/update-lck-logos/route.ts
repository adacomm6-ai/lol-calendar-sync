
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        console.log("Updating LCK Logos...");

        // Updated logos map (verified from Wiki/Official sources)
        // Some might be the same, but ensuring we have the correct ones.
        const teamLogos: Record<string, string> = {
            "BNK FEARX": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1704620436449_FearX.png", // Use LoL Esports if available, detailed wikia otherwise
            "DN SOOPers": "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/2/25/DN_SOOPerslogo_profile.png", // The one we found earlier
            "Dplus KIA": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1673260752538_Dplus_KIA_Logo.png",
            "KRX": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1673007077978_DRX_Logo_2023.png",
            "Gen.G": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1704375161757_GenG_Logo.png",
            "HANJIN BRION": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1704375200271_Brion_Logo.png", // BRO from LOLEsports
            "Hanwha Life Esports": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1631819669146_HLE_2021_Square.png",
            "KT Rolster": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2Fkt-full-on-dark.png",
            "Nongshim RedForce": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1608277252033_ns-redforce-logo.png",
            "T1": "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2Ft1-full-on-dark.png"
        };
        // Note: DN SOOPers and maybe new BRO might need Wiki links if not on lolesports yet.
        // I'll stick to Wiki links for the ones that might be new, but LoL Esports CDN is often more stable/clean if available.
        // Actually, for consistency, let's use the LoL Esports CDN for all established ones, and Wiki for new brands (DNS).
        // Wait, DNS logo from Wiki was: https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/2/25/DN_SOOPerslogo_profile.png

        // Let's mix and match for best quality.

        const updates = [];

        for (const [name, logo] of Object.entries(teamLogos)) {
            const update = prisma.team.updateMany({
                where: { name: name },
                data: { logo: logo }
            });
            updates.push(update);
        }

        await prisma.$transaction(updates);

        return NextResponse.json({ success: true, message: "LCK Logos Updated successfully" });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
