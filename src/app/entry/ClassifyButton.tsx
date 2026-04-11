'use client';

import { confirmAction } from '@/lib/confirm-dialog';
import { useState } from 'react';
import { classifyAllComments } from '@/app/admin/batch-fix/actions';

export default function ClassifyButton() {
    const [loading, setLoading] = useState(false);

    const handleClassify = async () => {
        if (!(await confirmAction('要对全部历史评论执行归类吗？这可能需要一段时间。'))) return;
        setLoading(true);
        try {
            const res = await classifyAllComments();
            if (res.success) {
                alert(res.logs?.join('\n') || '归类完成。');
            } else {
                alert('归类失败：' + res.error);
            }
        } catch (e) {
            alert('调用归类操作失败。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleClassify}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-700/50 hover:bg-purple-600/50 text-purple-100 rounded-lg border border-purple-500/30 transition-all text-sm font-bold disabled:opacity-50"
        >
            {loading ? '归类中...' : '归类历史评论'}
        </button>
    );
}

