import { getCachedScheduleMatches } from "@/lib/data-cache";
import BracketPlayground from "@/components/schedule/BracketPlayground";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export default async function PlaygroundPage() {
    // try to fetch some playoff matches to use as sample data
    const allMatches = await getCachedScheduleMatches("LPL", "2026", "Split 1 Playoffs");

    // We only need the raw matches array for the playground
    return (
        <div className="p-8 bg-slate-900 min-h-screen text-slate-100">
            <div className="mb-4">
                <Link href="/admin/schedule" className="text-blue-400 hover:text-blue-300 font-bold mb-4 inline-block">
                    &larr; 返回赛程管理
                </Link>
                <h1 className="text-3xl font-bold mt-2 text-white border-l-4 border-blue-500 pl-4">树状图可视排版实验室 (Playground)</h1>
                <p className="text-slate-400 text-sm mt-2 pl-5">拖动侧边栏滑块即可实时调整全局排版参数。调出合适的比例后，请将 JSON 变量复制并在代码默认常量中生效。</p>
            </div>
            <BracketPlayground initialMatches={allMatches} />
        </div>
    );
}
