import { confirmAction } from '@/lib/confirm-dialog';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { addComment, deleteComment, saveAnalysisNote } from '@/app/entry/upload/actions';
import { format } from 'date-fns';

interface Comment {
    id: string;
    content: string;
    author: string;
    userId?: string | null;
    type: string;
    createdAt: Date;
    gameNumber: number;
}

interface CommentsSectionProps {
    matchId: string;
    comments: Comment[];
    activeGameNumber: number;
    currentUserId?: string;
    isAdmin?: boolean;
    commentType?: string;
    commentTypes?: string[];
    title?: string;
    className?: string;
}

type EditorFormatState = {
    bold: boolean;
    underline: boolean;
    red: boolean;
    blue: boolean;
    highlight: boolean;
};

const EMPTY_EDITOR_FORMAT_STATE: EditorFormatState = {
    bold: false,
    underline: false,
    red: false,
    blue: false,
    highlight: false,
};

function EditIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}

function escapeHtml(input: string) {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeRichHtml(html: string) {
    return String(html || '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript:/gi, '');
}

function legacyToRichHtml(raw: string) {
    const text = String(raw || '').trim();
    if (!text) return '';

    if (/<[a-z][\s\S]*>/i.test(text)) {
        return sanitizeRichHtml(text);
    }

    let html = escapeHtml(text);
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\[red\]([\s\S]*?)\[\/red\]/gi, '<span style="color:#f87171;font-weight:700;">$1</span>');
    html = html.replace(/\[blue\]([\s\S]*?)\[\/blue\]/gi, '<span style="color:#67e8f9;font-weight:700;">$1</span>');
    html = html.replace(/\[hl\]([\s\S]*?)\[\/hl\]/gi, '<span style="background:rgba(250,204,21,0.25);color:#fde68a;padding:0 2px;border-radius:4px;">$1</span>');
    html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<span style="text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:2px;">$1</span>');
    html = html.replace(/\r?\n/g, '<br/>');
    return html;
}

function parseColorToRgb(color: string): [number, number, number] | null {
    const value = String(color || '').trim().toLowerCase();
    if (!value) return null;

    const rgbMatch = value.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
        return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
    }

    if (value.startsWith('#')) {
        let hex = value.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map((char) => char + char).join('');
        }
        if (hex.length >= 6) {
            const normalizedHex = hex.slice(0, 6);
            return [
                parseInt(normalizedHex.slice(0, 2), 16),
                parseInt(normalizedHex.slice(2, 4), 16),
                parseInt(normalizedHex.slice(4, 6), 16),
            ];
        }
    }

    return null;
}

function isSameColor(colorA: string, colorB: string) {
    const a = parseColorToRgb(colorA);
    const b = parseColorToRgb(colorB);
    if (!a || !b) return false;
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function isRichTextEmpty(html: string) {
    const plain = String(html || '')
        .replace(/<br\s*\/?>/gi, '')
        .replace(/&nbsp;/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, '')
        .trim();
    return plain.length === 0;
}
export default function CommentsSection({
    matchId,
    comments,
    activeGameNumber,
    currentUserId,
    isAdmin,
    commentType = 'POST_MATCH',
    commentTypes,
    title = '评论分析',
    className,
}: CommentsSectionProps) {
    const isEditor = [
        'PLAYER_ANALYSIS',
        'PLAYER_ANALYSIS_B',
        'GAME_SUMMARY',
        'SUMMARY_BP',
        'SUMMARY_FLOW',
        'SUMMARY_FIGHT',
        'POST_MATCH_A',
        'POST_MATCH_B',
        'POST_MATCH_C',
        'POST_MATCH_D',
        'PRE_MATCH',
        'PLAYER_REVIEW',
        'HIGHLIGHT_REVIEW',
        'PLAYER_HIGHLIGHT',
        'MATCH_FIXING_SUSPECT',
    ].includes(commentType || '');

    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewText, setPreviewText] = useState<string | null>(null);
    const [formatState, setFormatState] = useState<EditorFormatState>(EMPTY_EDITOR_FORMAT_STATE);

    const scrollRef = useRef<HTMLDivElement>(null);
    const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);

    const defaultTemplate = useMemo(() => {
        const hasPlayer = (commentTypes || []).some((t) => t.includes('PLAYER')) || commentType.includes('PLAYER');
        const hasHighlight = (commentTypes || []).some((t) => t.includes('POST_MATCH')) || commentType.includes('POST_MATCH');

        if (commentType === 'PLAYER_HIGHLIGHT') {
            return [
                '\u5173\u952e\u9009\u624b\uff1a [u][blue]________[/blue][/u]\uff08[u][blue]\u4f4d\u7f6e[/blue][/u]\uff09',
                '\u7cbe\u5f69\u56de\u5408\uff1a [u][red]XX:XX[/red][/u] \u5de6\u53f3',
                '\u51b3\u5b9a\u6027\u64cd\u4f5c\uff1a \u5148\u5199\u8fd9\u540d\u9009\u624b\u505a\u4e86\u4ec0\u4e48\uff0c\u600e\u4e48\u6253\u51fa\u4f18\u52bf\uff0c\u64cd\u4f5c\u7ec6\u8282\u662f\u4ec0\u4e48\u3002',
                '\u5bf9\u80dc\u8d1f\u7684\u5f71\u54cd\uff1a \u8fd9\u4e00\u6ce2\u4e4b\u540e\u5c40\u52bf\u5982\u4f55\u53d8\u5316\uff0c\u4e3a\u4ec0\u4e48\u80fd\u6210\u4e3a\u5173\u952e\u8f6c\u6298\u70b9\u3002',
                '\u4e00\u53e5\u8bdd\u603b\u7ed3\uff1a \u8fd9\u662f\u672c\u5c40\u6700\u5173\u952e\u7684\u4e2a\u4eba\u53d1\u6325\u3002',
            ].join('\n');
        }

        if (commentType === 'MATCH_FIXING_SUSPECT') {
            return [
                '\u7591\u4f3c\u9009\u624b\u540d\uff1a [u][red]________[/red][/u]',
                '\u6240\u5c5e\u961f\u4f0d / \u4f4d\u7f6e\uff1a [u][blue]________[/blue][/u] / [u][blue]________[/blue][/u]',
                '',
                '\u53ef\u7591\u65f6\u95f4\u70b9\uff1a [u][red]XX:XX[/red][/u] \u5de6\u53f3',
                '',
                '\u5f02\u5e38\u884c\u4e3a / \u51b3\u7b56\uff1a \u5148\u5199\u8fd9\u540d\u9009\u624b\u5f53\u65f6\u505a\u4e86\u4ec0\u4e48\u5f02\u5e38\u52a8\u4f5c\uff0c\u4f8b\u5982\u53cd\u5e38\u524d\u538b\u3001\u65e0\u89c6\u5173\u952e\u4fe1\u606f\u3001\u56e2\u6218\u5904\u7406\u660e\u663e\u4e0d\u5408\u7406\u3002',
                '',
                '\u4e0e\u5e38\u89c4\u8868\u73b0\u5bf9\u6bd4\uff1a \u8865\u5145\u4ed6\u5e73\u65f6\u540c\u7c7b\u5c40\u9762\u7684\u5e38\u89c4\u5904\u7406\u65b9\u5f0f\uff0c\u8fd9\u4e00\u6ce2\u4e3a\u4ec0\u4e48\u660e\u663e\u4e0d\u4e00\u6837\u3002',
                '',
                '\u98ce\u9669\u7ed3\u8bba\uff08\u4ec5\u5185\u90e8\u8bb0\u5f55\uff09\uff1a \u5148\u8bb0\u5f55\u4e3a\u201c\u9700\u8981\u7ee7\u7eed\u89c2\u5bdf / \u7ee7\u7eed\u590d\u6838\u201d\uff0c\u6682\u65f6\u4e0d\u8981\u76f4\u63a5\u4e0b\u7edd\u5bf9\u7ed3\u8bba\u3002',
            ].join('\n');
        }

        if (hasPlayer) {
            return [
                '【选手点评模板】',
                '1. 关键选手：',
                '2. 对线表现：',
                '3. 团战处理：',
                '4. 可优化点：',
            ].join('\n');
        }

        if (hasHighlight) {
            return [
                '\u9ad8\u5149\u56de\u5408\uff1a [u][red]XX:XX[/red][/u] \u5de6\u53f3',
                '\u5173\u952e\u64cd\u4f5c\uff1a \u5148\u5199\u6e05\u695a\u8fd9\u4e00\u6ce2\u4e3b\u8981\u662f\u8c01\u505a\u4e86\u4ec0\u4e48\uff0c\u5173\u952e\u52a8\u4f5c\u5728\u54ea\u91cc\u3002',
                '\u5c40\u52bf\u53d8\u5316\uff1a \u8fd9\u6ce2\u4e4b\u540e\u573a\u9762\u662f\u600e\u4e48\u88ab\u6253\u5f00\u6216\u76f4\u63a5\u5b9a\u4e0b\u6765\u7684\u3002',
                '\u4e00\u53e5\u8bdd\u7ed3\u8bba\uff1a \u7528\u4e00\u53e5\u8bdd\u8bf4\u6e05\u8fd9\u4e2a\u9ad8\u5149\u4e3a\u4ec0\u4e48\u503c\u5f97\u8bb0\u4e0b\u3002',
            ].join('\n');
        }

        if (commentType === 'PRE_MATCH') {
            return [
                '【赛前预测模板】',
                '1. 赛果方向：',
                '2. 关键判断依据：',
                '3. 风险点：',
                '4. 建议策略：',
            ].join('\n');
        }

        return '';
    }, [commentType, commentTypes]);

    const matchesCommentType = (c: Comment) => {
        if (commentTypes && commentTypes.length > 0) {
            if (!c.type) return commentTypes.includes('PLAYER_ANALYSIS');
            return commentTypes.includes(c.type);
        }
        if (!commentType) return true;
        return c.type === commentType;
    };

    useEffect(() => {
        if (!isEditor) return;

        const latest = comments
            .filter((c) => matchesCommentType(c) && c.gameNumber === activeGameNumber)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        if (latest) {
            setContent(latest.content || '');
            setLastSaved(new Date(latest.createdAt));
        } else {
            setContent(defaultTemplate || '');
            setLastSaved(null);
        }
    }, [isEditor, comments, commentType, commentTypes, activeGameNumber, defaultTemplate]);

    useEffect(() => {
        if (!isEditor && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [comments, isEditor]);

    useEffect(() => {
        if (!isEditor || !isEditing || !editorRef.current) return;
        editorRef.current.innerHTML = legacyToRichHtml(content);
        editorRef.current.focus();
        setTimeout(() => {
            syncEditorFormatState();
        }, 0);
    }, [isEditor, isEditing]);

    useEffect(() => {
        if (!isEditor || !isEditing || typeof document === 'undefined') return;

        const handleSelectionChange = () => {
            const selection = window.getSelection();
            const anchorNode = selection?.anchorNode;
            if (anchorNode && editorRef.current?.contains(anchorNode)) {
                syncEditorFormatState();
            }
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [isEditor, isEditing]);

    useEffect(() => {
        if (!isEditing) {
            setFormatState(EMPTY_EDITOR_FORMAT_STATE);
        }
    }, [isEditing]);

    const getEditorFormatState = (): EditorFormatState => {
        if (!editorRef.current || typeof document === 'undefined') {
            return EMPTY_EDITOR_FORMAT_STATE;
        }

        const selection = window.getSelection();
        const anchorNode = selection?.anchorNode || null;
        const isInsideEditor = !!(anchorNode && editorRef.current.contains(anchorNode));
        if (!isInsideEditor && document.activeElement !== editorRef.current) {
            return EMPTY_EDITOR_FORMAT_STATE;
        }

        const foreColor = String(document.queryCommandValue('foreColor') || '');
        const hiliteColor = String(document.queryCommandValue('hiliteColor') || '');

        return {
            bold: !!document.queryCommandState('bold'),
            underline: !!document.queryCommandState('underline'),
            red: isSameColor(foreColor, '#f87171'),
            blue: isSameColor(foreColor, '#67e8f9'),
            highlight: isSameColor(hiliteColor, '#facc15'),
        };
    };

    const syncEditorFormatState = () => {
        setFormatState(getEditorFormatState());
    };

    const handleSaveNote = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            const nextContent = isEditing && editorRef.current
                ? sanitizeRichHtml(editorRef.current.innerHTML)
                : content;
            const normalizedContent = isRichTextEmpty(nextContent) ? '' : nextContent;

            setContent(normalizedContent);

            const formData = new FormData();
            formData.append('matchId', matchId);
            formData.append('content', normalizedContent);
            formData.append('type', commentType);
            formData.append('gameNumber', activeGameNumber.toString());

            await saveAnalysisNote(formData);
            setLastSaved(new Date());
        } catch (e) {
            alert('Save failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChatSubmit = async () => {
        if (!content.trim() || isSubmitting) return;
        setIsSubmitting(true);

        try {
            const formData = new FormData();
            formData.append('matchId', matchId);
            formData.append('content', content);
            formData.append('type', commentType);
            formData.append('gameNumber', activeGameNumber.toString());
            await addComment(formData);
            setContent('');
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (await confirmAction('Confirm Delete?')) {
            await deleteComment(commentId, matchId);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isEditor) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSaveNote();
            }
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            if (e.repeat) return;
            e.preventDefault();
            handleChatSubmit();
        }
    };

    const runEditorCommand = (command: string, value?: string) => {
        if (!editorRef.current) return;
        if (document.activeElement !== editorRef.current) {
            editorRef.current.focus();
        }
        try {
            document.execCommand('styleWithCSS', false, 'true');
        } catch {
            // no-op
        }
        document.execCommand(command, false, value);
        setContent(sanitizeRichHtml(editorRef.current.innerHTML));
        syncEditorFormatState();
    };

    const clearAllStyles = () => {
        runEditorCommand('removeFormat');
        runEditorCommand('unlink');
    };

    const toggleEditorForeColor = (targetColor: string, fallbackColor = '#e2e8f0') => {
        if (!editorRef.current) return;
        const currentColor = String(document.queryCommandValue('foreColor') || '');
        if (isSameColor(currentColor, targetColor)) {
            runEditorCommand('foreColor', fallbackColor);
            return;
        }
        runEditorCommand('foreColor', targetColor);
    };

    const toggleEditorHighlight = (targetColor = '#facc15') => {
        if (!editorRef.current) return;
        const currentColor = String(document.queryCommandValue('hiliteColor') || '');
        if (isSameColor(currentColor, targetColor)) {
            runEditorCommand('hiliteColor', 'transparent');
            return;
        }
        runEditorCommand('hiliteColor', targetColor);
    };

    const renderChatContent = (text: string) => {
        const parts = text.split(/\*\*(.*?)\*\*/g);
        return parts.map((part, index) => {
            if (index % 2 === 1) {
                return (
                    <span key={index} className="text-red-400 font-bold bg-red-500/10 px-1 mx-0.5 rounded border border-red-500/20">
                        {part}
                    </span>
                );
            }
            return <span key={index}>{part}</span>;
        });
    };

    const previewHtml = legacyToRichHtml(content);
    const isContentEmpty = isRichTextEmpty(content);
    const currentToneLabel = formatState.red ? '\u7ea2\u8272' : formatState.blue ? '\u84dd\u8272' : formatState.highlight ? '\u9ad8\u4eae' : '\u9ed8\u8ba4';

    if (isEditor) {
        return (
            <div className={`flex flex-col h-full rounded-2xl overflow-hidden border border-white/5 ${className || 'glass'}`}>
                <div className="px-4 py-3 border-b border-white/5 bg-slate-900/40 flex justify-between items-center shrink-0">
                    <h3 className="font-black text-white flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]">
                        <span>{title}</span>
                    </h3>
                    <div className="flex items-center gap-3">
                        {lastSaved && <span className="text-[10px] font-bold text-slate-500 uppercase">SAVED: {format(lastSaved, 'HH:mm:ss')}</span>}

                        {isEditing ? (
                            <>
                                <button
                                    onClick={() => setIsEditing(false)}
                                    title="取消"
                                    aria-label="取消"
                                    className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/15 flex items-center justify-center"
                                >
                                    ×
                                </button>
                                <button
                                    onClick={async () => {
                                        await handleSaveNote();
                                        setIsEditing(false);
                                    }}
                                    disabled={isSubmitting}
                                    title="完成"
                                    aria-label="完成"
                                    className="w-8 h-8 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white border border-white/20 flex items-center justify-center disabled:opacity-60"
                                >
                                    {isSubmitting ? (
                                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    ) : (
                                        '√'
                                    )}
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                title="Edit note"
                                aria-label="Edit note"
                                className="w-8 h-8 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 transition-all border border-white/20 flex items-center justify-center"
                            >
                                <EditIcon />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 relative bg-slate-950/20 overflow-y-auto">
                    {isEditing ? (
                        <>
                            {isContentEmpty && defaultTemplate && (
                                <div
                                    className="w-full h-full bg-transparent p-5 text-sm text-slate-500/80 font-medium leading-relaxed absolute inset-0 overflow-y-auto pointer-events-none"
                                    dangerouslySetInnerHTML={{ __html: legacyToRichHtml(defaultTemplate) }}
                                />
                            )}
                            <div
                                ref={editorRef}
                                contentEditable
                                suppressContentEditableWarning
                                onInput={() => {
                                    const next = sanitizeRichHtml(editorRef.current?.innerHTML || '');
                                    setContent(isRichTextEmpty(next) ? '' : next);
                                    syncEditorFormatState();
                                }}
                                onKeyDown={handleKeyDown}
                                onKeyUp={syncEditorFormatState}
                                onMouseUp={syncEditorFormatState}
                                className="w-full h-full bg-transparent p-5 pb-24 text-sm text-slate-200 focus:outline-none font-medium leading-relaxed absolute inset-0 overflow-y-auto z-10"
                            />

                            <div className="absolute bottom-4 right-4 flex flex-wrap items-center gap-2 opacity-80 hover:opacity-100 transition-opacity z-20">
                                <div className="h-8 px-2 rounded-lg bg-slate-900/80 border border-white/10 text-[10px] font-black text-slate-300 flex items-center">{currentToneLabel}</div>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runEditorCommand('bold')} className={`w-8 h-8 rounded-lg text-[11px] font-black border transition-all ${formatState.bold ? 'bg-white text-slate-900 border-white shadow-[0_0_0_1px_rgba(255,255,255,0.35)]' : 'bg-slate-800/90 hover:bg-slate-700 text-white border-white/10'}`} title="加粗">B</button>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runEditorCommand('underline')} className={`w-8 h-8 rounded-lg text-[10px] font-black border transition-all ${formatState.underline ? 'bg-cyan-300 text-slate-900 border-cyan-100 shadow-[0_0_0_1px_rgba(103,232,249,0.45)]' : 'bg-cyan-700/90 hover:bg-cyan-600 text-white border-cyan-300/40'}`} title="下划线">下</button>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleEditorForeColor('#f87171')} className={`w-8 h-8 rounded-lg text-[10px] font-black border transition-all ${formatState.red ? 'bg-red-300 text-slate-900 border-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.5)]' : 'bg-red-500/90 hover:bg-red-500 text-white border-red-300/40'}`} title="红色">红</button>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleEditorForeColor('#67e8f9')} className={`w-8 h-8 rounded-lg text-[10px] font-black border transition-all ${formatState.blue ? 'bg-cyan-200 text-slate-900 border-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.5)]' : 'bg-cyan-500/90 hover:bg-cyan-500 text-white border-cyan-300/40'}`} title="蓝色">蓝</button>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleEditorHighlight('#facc15')} className={`w-8 h-8 rounded-lg text-[10px] font-black border transition-all ${formatState.highlight ? 'bg-yellow-300 text-slate-900 border-yellow-50 shadow-[0_0_0_1px_rgba(250,204,21,0.5)]' : 'bg-yellow-500/90 hover:bg-yellow-500 text-slate-900 border-yellow-200/60'}`} title="高亮">高</button>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runEditorCommand('fontSize', '2')} className="w-8 h-8 rounded-lg bg-slate-700/90 hover:bg-slate-600 text-white text-[10px] font-black border border-white/20" title="缩小字号">A-</button>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runEditorCommand('fontSize', '5')} className="w-8 h-8 rounded-lg bg-slate-700/90 hover:bg-slate-600 text-white text-[10px] font-black border border-white/20" title="放大字号">A+</button>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={clearAllStyles} className="h-8 px-2 rounded-lg bg-slate-700/90 hover:bg-slate-600 text-white text-[10px] font-black border border-white/20" title="清除样式">清</button>

                                {commentType === 'PRE_MATCH' && (
                                    <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={async () => {
                                            if (isGenerating) return;
                                            setIsGenerating(true);
                                            try {
                                                const { generateStrategyAction } = await import('@/app/match/actions');
                                                const res = await generateStrategyAction(matchId);
                                                if (res.success && res.text) {
                                                    setPreviewText(res.text);
                                                } else {
                                                    alert('AI Generation Failed: ' + (res.error || 'Unknown error'));
                                                }
                                            } finally {
                                                setIsGenerating(false);
                                            }
                                        }}
                                        disabled={isGenerating}
                                        className={`h-8 px-4 rounded-lg flex items-center justify-center font-black border text-[10px] uppercase tracking-widest transition-all ${isGenerating
                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500 shadow-sm shadow-indigo-100'
                                            }`}
                                        title="Generate AI Strategy"
                                    >
                                        {isGenerating ? 'GENERATING' : '✨ AI v2'}
                                    </button>
                                )}
                            </div>
                        </>
                    ) : previewHtml ? (
                        <div className="p-6 text-sm text-slate-300 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    ) : defaultTemplate ? (
                        <div className="p-6 text-sm text-slate-500/80 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: legacyToRichHtml(defaultTemplate) }} />
                    ) : (
                        <div className="p-6 text-sm text-slate-500 leading-relaxed font-medium">暂无点评，点击编辑添加内容。</div>
                    )}
                </div>

                {previewText !== null && typeof document !== 'undefined' && createPortal(
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md">
                        <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
                            <div className="px-6 py-4 border-b border-white/5 bg-slate-950/50 flex justify-between items-center shrink-0">
                                <h3 className="font-black text-white text-lg flex items-center gap-2 uppercase">
                                    <span className="text-blue-500">AI</span> AI ARCHIVE PREVIEW
                                </h3>
                                <button onClick={() => setPreviewText(null)} className="text-slate-500 hover:text-white transition-colors">✕</button>
                            </div>
                            <div className="p-6 flex-1 overflow-hidden flex flex-col min-h-0">
                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-3 shrink-0">REVIEW CONTENT BEFORE INSERTION</p>
                                <textarea
                                    value={previewText}
                                    onChange={(e) => setPreviewText(e.target.value)}
                                    className="flex-1 w-full bg-slate-950 p-6 text-sm text-slate-200 rounded-2xl border border-white/5 focus:border-blue-500/30 focus:outline-none resize-none font-medium leading-relaxed"
                                />
                            </div>
                            <div className="px-6 py-4 border-t border-white/5 bg-slate-950/50 flex justify-end gap-2 shrink-0">
                                <button onClick={() => setPreviewText(null)} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/15 flex items-center justify-center">×</button>
                                <button
                                    onClick={() => {
                                        setContent((prev) => isRichTextEmpty(prev) ? legacyToRichHtml(previewText) : `${prev}<br/><br/>${legacyToRichHtml(previewText)}`);
                                        setPreviewText(null);
                                    }}
                                    className="w-8 h-8 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white border border-white/20 flex items-center justify-center"
                                >
                                    √
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
            </div>
        );
    }

    const handleChatHighlight = () => {
        if (!chatTextareaRef.current) return;
        const ta = chatTextareaRef.current;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (start === end) return;
        const txt = content;
        const next = `${txt.slice(0, start)}**${txt.slice(start, end)}**${txt.slice(end)}`;
        setContent(next);
        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(start + 2, end + 2);
        }, 0);
    };

    return (
        <div className={`flex flex-col h-full rounded-2xl overflow-hidden border border-white/5 ${className || 'glass'}`}>
            <div className="px-4 py-3 border-b border-white/5 bg-slate-900/40 flex justify-between items-center shrink-0">
                <h3 className="font-black text-white flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]">
                    <span>{title}</span>
                </h3>
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">GAME {activeGameNumber} LIVE</span>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5">
                {comments.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-300 text-[10px] font-black uppercase tracking-widest gap-2">
                        <span className="text-2xl grayscale">🗒️</span>
                        NO CHAT RECORDS
                    </div>
                )}

                {comments.map((comment) => {
                    const isMe = currentUserId && comment.userId === currentUserId;

                    return (
                        <div key={comment.id} className={`flex flex-col gap-1.5 ${isMe ? 'items-end' : 'items-start'} group`}>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-tighter ${isMe ? 'text-blue-400 order-2' : 'text-slate-500'}`}>
                                    {comment.author}
                                </span>
                                <span className="text-[9px] font-bold text-slate-700">
                                    {format(new Date(comment.createdAt), 'HH:mm')}
                                </span>
                                {isAdmin && (
                                    <button
                                        onClick={() => handleDelete(comment.id)}
                                        className="text-red-500/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] ml-1"
                                        title="Delete Comment"
                                    >
                                        删除
                                    </button>
                                )}
                            </div>
                            <div className={`px-4 py-2.5 rounded-2xl text-sm max-w-[90%] break-words leading-relaxed shadow-sm font-medium ${isMe
                                ? 'bg-blue-600 text-white rounded-tr-none shadow-blue-500/20'
                                : 'bg-slate-900/60 text-slate-200 border border-white/5 rounded-tl-none'
                                }`}>
                                {renderChatContent(comment.content)}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="p-4 border-t border-white/5 bg-slate-900/40 shrink-0 space-y-3">
                <textarea
                    ref={chatTextareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Write a comment..."
                    className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-blue-500/50 resize-none h-24 placeholder:text-slate-700 transition-all font-medium shadow-inner"
                />
                <div className="flex justify-between items-center px-1">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleChatHighlight}
                            className="bg-red-50 hover:bg-red-100 border border-red-100 text-red-500 px-3 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all shadow-sm"
                            title="Highlight selected text (Red)"
                        >
                            MARK RED
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-bold text-slate-600 hidden sm:inline-block uppercase tracking-widest">ENTER TO POST</span>
                        <button
                            onClick={handleChatSubmit}
                            disabled={isSubmitting || !content.trim()}
                            className="px-8 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-700 text-white font-black rounded-full text-[10px] uppercase tracking-widest transition-all shadow-lg"
                        >
                            SUBMIT
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}











