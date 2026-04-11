
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const SCRAPED_DATA = [
    { name: "AL", url: "https://img.crawler.qq.com/lolwebvideo/20250618145633/b8741548f37b60a6693cdb6f4949a7fd/0" },
    { name: "BLG", url: "https://img.crawler.qq.com/lolwebvideo/20250618144525/49342dadcecf162e8ac94fad6eb91540/0" },
    { name: "EDG", url: "https://img.crawler.qq.com/lolwebvideo/20230103153103/7c5a8db3be3d7c93114ac47a801d64cb/0" },
    { name: "IG", url: "https://img.crawler.qq.com/lolwebvideo/20230103152918/562affbb9f99b0e472644f93a19291e7/0" },
    { name: "北京JDG英特尔", url: "https://img.crawler.qq.com/lolwebvideo/20230921143554/1e5189e914e40bfe18045bccbfc7ef82/0" },
    { name: "LGD", url: "https://img.crawler.qq.com/lolwebvideo/20230103153121/0cef697fa6d0416e672c2fd90f30718c/0" },
    { name: "苏州LNG", url: "https://img.crawler.qq.com/lolwebvideo/20240920155556/f4510f27cb1d914d0d3204c8dbab6217/0" },
    { name: "深圳NIP", url: "https://img.crawler.qq.com/lolwebvideo/20230103152746/c8a8f59fadc0da0bda0c4997e3f62afb/0" },
    { name: "OMG", url: "https://img.crawler.qq.com/lolwebvideo/20230103152756/56c5bb71d14d13ec280908542ac8e1a9/0" },
    { name: "TES", url: "https://img.crawler.qq.com/lolwebvideo/20240920155538/5beb948638f00bcda68fc4942e3f0a51/0" },
    { name: "TT", url: "https://img.crawler.qq.com/lolwebvideo/20230103152930/f1e243799a62f73f37af8f10be9dd977/0" },
    { name: "UP", url: "https://img.crawler.qq.com/lolwebvideo/20230103152805/12c63663ab401c815ccded42a5ad47e6/0" },
    { name: "WBGTapTap", url: "https://img.crawler.qq.com/lolwebvideo/20240920155612/8df4b2b15f3e97f047ac978711134748/0" },
    { name: "西安WE", url: "https://img.crawler.qq.com/lolwebvideo/20230103153050/5c22150153baa973f73adf4909a041ec/0" }
];

const NAME_MAP: Record<string, string> = {
    "北京JDG英特尔": "JDG",
    "苏州LNG": "LNG",
    "深圳NIP": "NIP",
    "WBGTapTap": "WBG",
    "西安WE": "WE"
};

export async function GET() {
    try {
        const publicDir = path.join(process.cwd(), 'public', 'teams');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }

        const results = [];

        for (const item of SCRAPED_DATA) {
            const shortName = NAME_MAP[item.name] || item.name;
            const fileName = `${shortName}.png`;
            const filePath = path.join(publicDir, fileName);
            const publicPath = `/teams/${fileName}`;

            // Download image
            const response = await fetch(item.url);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(filePath, Buffer.from(buffer));

                // Update DB
                const team = await prisma.team.findFirst({ where: { shortName } });
                if (team) {
                    await prisma.team.update({
                        where: { id: team.id },
                        data: { logo: publicPath }
                    });
                    results.push(`Updated ${shortName}`);
                } else {
                    results.push(`Skipped ${shortName} (Not in DB)`);
                }
            } else {
                results.push(`Failed to download for ${shortName}`);
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}
