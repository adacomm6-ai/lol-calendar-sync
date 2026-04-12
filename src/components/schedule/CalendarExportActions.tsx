'use client';

import { useMemo, useState } from 'react';

type CalendarExportActionsProps = {
    calendarPath: string;
};

const IPHONE_CALENDAR_HTTP_URL =
    'https://raw.githubusercontent.com/adacomm6-ai/lol-calendar-sync/main/iphone-calendar.ics';
const IPHONE_CALENDAR_LOCAL_DOWNLOAD_URL = '/iphone-calendar.ics?download=1';

export default function CalendarExportActions({ calendarPath }: CalendarExportActionsProps) {
    const [copyStatus, setCopyStatus] = useState('');
    const localDownloadUrl = useMemo(() => {
        void calendarPath;
        return IPHONE_CALENDAR_LOCAL_DOWNLOAD_URL;
    }, [calendarPath]);

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
        <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
                <div className="text-sm font-black text-blue-900">苹果日历（仅 LPL + LCK）</div>
                <div className="text-xs text-blue-700">
                    电脑本地点“下载导入苹果日历”会直接下载 .ics 文件。把这个文件发到 iPhone 后再导入日历；若你之前导入过旧版本，请先删除旧日历，避免旧赛程残留。
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <a
                    href={localDownloadUrl}
                    className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                    下载导入苹果日历
                </a>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                >
                    复制导入链接
                </button>
            </div>

            {copyStatus ? <div className="text-xs font-bold text-blue-700">{copyStatus}</div> : null}
        </div>
    );
}
