'use client';

import { useEffect, useState } from 'react';

type CalendarExportActionsProps = {
    calendarPath: string;
};

function buildAbsoluteHttpUrl(calendarPath: string) {
    if (typeof window === 'undefined') return calendarPath;
    return new URL(calendarPath, window.location.origin).toString();
}

function buildAppleSubscribeUrl(calendarPath: string) {
    const httpUrl = buildAbsoluteHttpUrl(calendarPath);
    if (httpUrl.startsWith('https://')) return `webcal://${httpUrl.slice('https://'.length)}`;
    return httpUrl;
}

export default function CalendarExportActions({ calendarPath }: CalendarExportActionsProps) {
    const [subscribeHref, setSubscribeHref] = useState(calendarPath);
    const [copyStatus, setCopyStatus] = useState('');

    useEffect(() => {
        setSubscribeHref(buildAppleSubscribeUrl(calendarPath));
    }, [calendarPath]);

    const handleCopy = async () => {
        try {
            const httpUrl = buildAbsoluteHttpUrl(calendarPath);
            await navigator.clipboard.writeText(httpUrl);
            setCopyStatus('订阅链接已复制');
            window.setTimeout(() => setCopyStatus(''), 2200);
        } catch {
            setCopyStatus('复制失败，请手动长按链接');
            window.setTimeout(() => setCopyStatus(''), 3000);
        }
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
                <div className="text-sm font-black text-blue-900">苹果日历</div>
                <div className="text-xs text-blue-700">
                    当前筛选的赛程可以直接订阅到 iPhone 日历，后续赛程更新后苹果会自动拉取刷新。
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <a
                    href={subscribeHref}
                    className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                    导入苹果日历
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
