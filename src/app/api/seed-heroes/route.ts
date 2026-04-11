
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        console.log("Fetching Champion Data from Data Dragon...");
        // 1. Get latest version
        const versionRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        const versions = await versionRes.json();
        const latest = versions[0];
        console.log(`Latest Version: ${latest}`);

        // 2. Get Champion List (CN Locale for Chinese Names)
        const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/zh_CN/champion.json`);
        const champData = await champRes.json();

        const champions = Object.values(champData.data);
        console.log(`Found ${champions.length} champions`);

        let count = 0;
        for (const champ of champions as any[]) {
            // Data Dragon structure: 
            // id: "Aatrox" (English)
            // name: "暗裔剑魔" (Chinese because we fetched zh_CN)
            // title: "亚托克斯" -> wait, title is "亚托克斯" (The Darkin Blade)? 
            // Actually in zh_CN:
            // name: "亚托克斯" (The Name)
            // title: "暗裔剑魔" (The Title)

            // We want searchable text. 
            // DB 'name' -> Unique Key (English ID is best for uniqueness)
            // DB 'alias' -> Chinese Name (Display)

            await prisma.hero.upsert({
                where: { name: champ.id },
                update: {
                    alias: champ.name, // Chinese Name e.g. "亚托克斯"
                    title: champ.title, // Chinese Title e.g. "暗裔剑魔"
                    avatarUrl: `https://ddragon.leagueoflegends.com/cdn/${latest}/img/champion/${champ.id}.png`
                },
                create: {
                    id: champ.id,
                    name: champ.id,
                    alias: champ.name,
                    title: champ.title,
                    avatarUrl: `https://ddragon.leagueoflegends.com/cdn/${latest}/img/champion/${champ.id}.png`
                }
            });
            count++;
        }

        return NextResponse.json({ success: true, count, version: latest });

    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
