'use client';

import { useState } from 'react';

type CalendarExportActionsProps = {
    calendarPath: string;
};

const IPHONE_CALENDAR_HTTP_URL =
    'https://cdn.jsdelivr.net/gh/adacomm6-ai/lol-calendar-sync@main/iphone-calendar.ics';

export default function CalendarExportActions({ calendarPath }: CalendarExportActionsProps) {
    void calendarPath;

    const [copyStatus, setCopyStatus] = useState('');

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(IPHONE_CALENDAR_HTTP_URL);
            setCopyStatus('订阅链接已复制，可直接粘贴到 iPhone 的“添加已订阅的日历”。');
            window.setTimeout(() => setCopyStatus(''), 2200);
        } catch {
            setCopyStatus('复制失败，请手动长按按钮链接后再复制。');
            window.setTimeout(() => setCopyStatus(''), 3000);
        }
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
                <div className="text-sm font-black text-blue-900">苹果日历（LPL + LCK）</div>
                <div className="text-xs text-blue-700">
                    iPhone 固定版只保留 LPL 和 LCK，已去除 LEC。复制链接可用于“添加已订阅的日历”；如果你之前导入过旧版本地日历，建议先删除旧版再重新导入，避免旧赛程残留。
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <a
                    href={IPHONE_CALENDAR_HTTP_URL}
                    className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                    下载导入苹果日历
                </a>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                >
                    复制订阅链接
                </button>
            </div>

            {copyStatus ? <div className="text-xs font-bold text-blue-700">{copyStatus}</div> : null}
        </div>
    );
}