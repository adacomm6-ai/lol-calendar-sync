'use client';

import { useState } from 'react';

type CalendarExportActionsProps = {
    calendarPath: string;
};

const IPHONE_CALENDAR_HTTP_URL =
    'https://raw.githubusercontent.com/adacomm6-ai/lol-calendar-sync/main/iphone-calendar.ics';
const IPHONE_CALENDAR_LOCAL_DOWNLOAD_BASE_URL =
    '/iphone-calendar.ics?download=1&status=upcoming&regions=LPL,LCK&days=120';

export default function CalendarExportActions({ calendarPath }: CalendarExportActionsProps) {
    const [copyStatus, setCopyStatus] = useState('');
    const [panelOpen, setPanelOpen] = useState(false);
    const [lplFromDate, setLplFromDate] = useState('');
    const [lplToDate, setLplToDate] = useState('');
    const [lckFromDate, setLckFromDate] = useState('');
    const [lckToDate, setLckToDate] = useState('');
    void calendarPath;

    const handleDefaultDownload = () => {
        const downloadUrl = `${IPHONE_CALENDAR_LOCAL_DOWNLOAD_BASE_URL}&_ts=${Date.now()}`;
        window.location.href = downloadUrl;
    };

    const handleRegionDateDownload = () => {
        const params = new URLSearchParams();
        params.set('download', '1');
        params.set('status', 'upcoming');
        params.set('regions', 'LPL,LCK');
        params.set('days', '120');
        params.set('exportMode', 'full');
        if (lplFromDate) params.set('from_LPL', lplFromDate);
        if (lplToDate) params.set('to_LPL', lplToDate);
        if (lckFromDate) params.set('from_LCK', lckFromDate);
        if (lckToDate) params.set('to_LCK', lckToDate);
        params.set('_ts', String(Date.now()));
        window.location.href = `/iphone-calendar.ics?${params.toString()}`;
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(IPHONE_CALENDAR_HTTP_URL);
            setCopyStatus('链接已复制。若网站只能本地打开，请先在电脑下载，再发到手机导入。');
            window.setTimeout(() => setCopyStatus(''), 2400);
        } catch {
            setCopyStatus('复制失败，请手动长按按钮链接后再复制。');
            window.setTimeout(() => setCopyStatus(''), 3000);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
            {panelOpen ? (
                <div className="w-[min(92vw,380px)] rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-2xl backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <div className="text-sm font-black text-blue-900">苹果日历导出</div>
                            <div className="text-xs leading-5 text-slate-600">
                                默认只导出未来未结束的 LPL 与 LCK。
                                如果两个赛区补导日期不同，用下面的赛区日期范围分别导出。
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPanelOpen(false)}
                            className="rounded-full border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                        >
                            收起
                        </button>
                    </div>

                    <div className="mt-4 space-y-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                        <div className="text-xs font-bold text-blue-900">按赛区日期下载</div>

                        <div className="space-y-2">
                            <div className="text-[11px] font-bold text-slate-700">LPL 日期范围</div>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="date"
                                    value={lplFromDate}
                                    onChange={(event) => setLplFromDate(event.target.value)}
                                    className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400"
                                    aria-label="LPL 开始日期"
                                />
                                <input
                                    type="date"
                                    value={lplToDate}
                                    onChange={(event) => setLplToDate(event.target.value)}
                                    className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400"
                                    aria-label="LPL 结束日期"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-[11px] font-bold text-slate-700">LCK 日期范围</div>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="date"
                                    value={lckFromDate}
                                    onChange={(event) => setLckFromDate(event.target.value)}
                                    className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400"
                                    aria-label="LCK 开始日期"
                                />
                                <input
                                    type="date"
                                    value={lckToDate}
                                    onChange={(event) => setLckToDate(event.target.value)}
                                    className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400"
                                    aria-label="LCK 结束日期"
                                />
                            </div>
                        </div>

                        <div className="text-[11px] leading-5 text-slate-600">
                            例子：LPL 从 2026-05-18 开始、LCK 从 2026-05-26 开始，就能分别补导两个赛区后续赛程而不重复。
                        </div>

                        <button
                            type="button"
                            onClick={handleRegionDateDownload}
                            className="inline-flex w-full items-center justify-center rounded-full border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100"
                        >
                            按赛区日期下载
                        </button>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button
                            type="button"
                            onClick={handleDefaultDownload}
                            className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                        >
                            下载苹果日历
                        </button>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
                        >
                            复制导入链接
                        </button>
                    </div>

                    {copyStatus ? (
                        <div className="mt-3 text-xs font-bold text-blue-700">{copyStatus}</div>
                    ) : null}
                </div>
            ) : null}

            <button
                type="button"
                onClick={() => setPanelOpen((value) => !value)}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-xl transition hover:bg-blue-700"
                aria-expanded={panelOpen}
                aria-label="打开苹果日历导出面板"
            >
                <span>苹果日历</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">LPL + LCK</span>
            </button>
        </div>
    );
}
