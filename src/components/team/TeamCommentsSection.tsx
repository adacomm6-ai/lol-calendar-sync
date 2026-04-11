'use client';

import { useState, useEffect, useRef } from 'react';
import { updateTeamNote } from '@/app/teams/[id]/actions';
import { useAdmin } from '@/hooks/useAdmin';

interface Comment {
    id: string;
    content: string;
    author: string;
    createdAt: Date;
}

interface Props {
    teamId: string;
    comments: Comment[];
}

export default function TeamCommentsSection({ teamId, comments }: Props) {
    const isAdmin = useAdmin();
    // 当前按你的需求：所有人可编辑（Wiki 模式）
    const isEditor = true;

    const initialNote = comments.length > 0 ? comments[0].content : '';
    const editorRef = useRef<HTMLDivElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(comments.length > 0 ? new Date(comments[0].createdAt) : null);

    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.innerHTML = initialNote;
        }
    }, [initialNote]);

    const handleSave = async () => {
        if (!isEditor || !editorRef.current) return;

        const content = editorRef.current.innerHTML;
        setIsSaving(true);
        try {
            await updateTeamNote(teamId, content);
            setLastSaved(new Date());
        } catch (error) {
            console.error('保存备注失败', error);
            alert('保存失败');
        } finally {
            setIsSaving(false);
        }
    };

    const applyColor = (color: string) => {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('foreColor', false, color);
    };

    if (!isEditor) {
        if (!initialNote) return null;
        return (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-900">
                    <span className="text-blue-600">▌</span>
                    队伍分析
                </h3>
                <div className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-700" dangerouslySetInnerHTML={{ __html: initialNote }} />
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                    <span className="text-blue-600">▌</span>
                    队伍分析
                </h3>

                <div className="flex items-center gap-4">
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 border border-amber-200">
                        本地编辑模式
                    </span>
                    {lastSaved && <span className="text-xs font-medium text-gray-400">最后更新：{lastSaved.toLocaleString()}</span>}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSaving ? '保存中...' : '保存备注'}
                    </button>
                </div>
            </div>

            <div className="mb-2 flex items-center gap-2 rounded-t-lg border-x border-t border-gray-200 bg-gray-50 p-2">
                <button
                    onClick={() => applyColor('#ef4444')}
                    className="h-6 w-6 rounded bg-red-500 shadow-sm transition-colors hover:bg-red-600"
                    title="红色文字"
                />
                <button
                    onClick={() => applyColor('#000000')}
                    className="h-6 w-6 rounded border border-gray-300 bg-black shadow-sm transition-colors hover:bg-gray-800"
                    title="黑色文字(重置)"
                />
            </div>

            <div
                ref={editorRef}
                contentEditable
                className="min-h-[120px] w-full overflow-auto rounded-b-lg border border-gray-200 p-4 font-sans text-sm leading-relaxed text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
            />
        </div>
    );
}
