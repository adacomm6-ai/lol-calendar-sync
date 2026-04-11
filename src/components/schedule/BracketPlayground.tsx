'use client';

import { useState } from 'react';
import PlayoffBracketView, { PlayoffBracketConfig, computeDefaultPositions } from '@/components/schedule/PlayoffBracketView';

export default function BracketPlayground({ initialMatches }: { initialMatches: any[] }) {
    const [config, setConfig] = useState<PlayoffBracketConfig>({
        cardWidth: 160,
        colGap: 32,
        rowGap: 24,
    });

    const handleCopy = () => {
        const text = JSON.stringify(config, null, 4);
        navigator.clipboard.writeText(text);
        alert('配置 JSON 已成功复制到剪贴板！可以直接覆盖 PlayoffBracketView.tsx 中的 DEFAULT_CONFIG');
    };

    /** 接收绝对坐标 (x, y) 直接覆盖对应节点的位置 */
    const handleNodeDrag = (key: string, x: number, y: number) => {
        setConfig(prev => {
            // 首次拖拽时，先用默认布局初始化全部节点坐标，避免其他节点落在 (0,0)
            const currentPos = prev.nodePositions || computeDefaultPositions(prev);

            return {
                ...prev,
                nodePositions: {
                    ...currentPos,
                    [key]: { x, y }
                }
            };
        });
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 mt-6 items-start">
            {/* Sidebar Controls */}
            <div className="w-full lg:w-80 bg-slate-800 p-6 rounded-xl border border-slate-700 shrink-0 sticky top-4">
                <h2 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-2">参数控制器 (Sliders)</h2>

                <div className="space-y-6">
                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-medium text-slate-300">卡片宽度 (cardWidth)</label>
                            <span className="text-blue-400 text-sm font-mono">{config.cardWidth}px</span>
                        </div>
                        <input type="range" min="120" max="240" step="4" value={config.cardWidth}
                            onChange={e => setConfig({ ...config, cardWidth: parseInt(e.target.value) })}
                            className="w-full accent-blue-500" />
                        <p className="text-[10px] text-slate-500 mt-1">控制每个比分对决卡片的长度及列占位。</p>
                    </div>

                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-medium text-slate-300">列间距 (colGap)</label>
                            <span className="text-blue-400 text-sm font-mono">{config.colGap}px</span>
                        </div>
                        <input type="range" min="16" max="120" step="4" value={config.colGap}
                            onChange={e => setConfig({ ...config, colGap: parseInt(e.target.value) })}
                            className="w-full accent-blue-500" />
                        <p className="text-[10px] text-slate-500 mt-1">控制轮次与轮次之间的水平空白跨度，这会直接影响 SVG 连线的长度计算。</p>
                    </div>

                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-medium text-slate-300">行间距 (rowGap)</label>
                            <span className="text-blue-400 text-sm font-mono">{config.rowGap}px</span>
                        </div>
                        <input type="range" min="8" max="64" step="4" value={config.rowGap}
                            onChange={e => setConfig({ ...config, rowGap: parseInt(e.target.value) })}
                            className="w-full accent-blue-500" />
                        <p className="text-[10px] text-slate-500 mt-1">控制上下两场有关联的比拼之间的垂直留白高度。重新计算时生效。</p>
                    </div>
                </div>

                <div className="mt-10">
                    <button onClick={handleCopy} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded shadow-md transition-colors border border-blue-400">
                        {`{`} 复制 JSON 格式配置 {`}`}
                    </button>
                    <p className="text-xs text-slate-500 mt-3 text-center">系统检测到目前存在 {initialMatches.length} 场匹配的赛程数据</p>
                </div>
            </div>

            {/* Preview Canvas */}
            <div className="flex-1 bg-white rounded-xl overflow-hidden border border-slate-300 shadow-xl min-w-0">
                <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 font-bold text-slate-600 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        <span>实时渲染预览区 (Live Preview)</span>
                    </div>
                    <span className="text-xs font-normal bg-orange-100 text-orange-600 px-2 py-0.5 rounded border border-orange-200 shadow-sm">Scale 0.7x</span>
                </div>
                {/* 内部再包一层容器，使用 transform scale 使得管理员屏幕能看全 */}
                <div className="p-4 bg-white flex justify-start items-start overflow-auto" style={{ minHeight: '800px' }}>
                    {initialMatches.length > 0 ? (
                        <div className="origin-top-left" style={{ transform: 'scale(0.7)' }}>
                            <PlayoffBracketView matches={initialMatches} config={config} onNodeDrag={handleNodeDrag} />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400 h-full w-full py-40">
                            <p className="mb-8 font-bold text-lg">当前过滤的阶段没有找到真实赛程，展示完全占位节点视图：</p>
                            <div className="origin-top border-4 border-dashed border-gray-100 p-10 rounded-3xl" style={{ transform: 'scale(0.85)' }}>
                                <PlayoffBracketView matches={[]} config={config} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
