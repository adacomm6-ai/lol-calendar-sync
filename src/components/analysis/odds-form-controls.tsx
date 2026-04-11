'use client';

import { useRef } from 'react';

function sanitizeUnsignedNumericDraft(value: string, allowDecimal = true) {
    const cleaned = value.replace(/[^\d.]/g, '');
    if (!allowDecimal) return cleaned.replace(/\./g, '');

    const firstDotIndex = cleaned.indexOf('.');
    if (firstDotIndex < 0) return cleaned;

    const head = cleaned.slice(0, firstDotIndex + 1);
    const tail = cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
    return head + tail;
}

export function splitOddsParts(raw?: string | number | null) {
    const source = String(raw ?? '').trim();
    if (!source) return { whole: '', decimal: '' };
    const [whole = '', decimal = ''] = source.split('.');
    return {
        whole: whole.replace(/\D/g, ''),
        decimal: decimal.replace(/\D/g, '').slice(0, 3),
    };
}

export function buildOddsValue(whole: string, decimal: string) {
    const normalizedWhole = whole.trim();
    const normalizedDecimal = decimal.trim();
    if (!normalizedWhole && !normalizedDecimal) return '';
    if (!normalizedWhole) return `0.${normalizedDecimal || '000'}`;
    return normalizedDecimal ? `${normalizedWhole}.${normalizedDecimal}` : normalizedWhole;
}

export function HelpTooltipLabel({
    label,
    tip,
    className = '',
}: {
    label: string;
    tip: string;
    className?: string;
}) {
    return (
        <div className={`mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-400 ${className}`}>
            <span>{label}</span>
            <span
                title={tip}
                aria-label={tip}
                className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[10px] font-black text-cyan-300"
            >
                ?
            </span>
        </div>
    );
}

export function OddsSplitField({
    wholeValue,
    decimalValue,
    onWholeChange,
    onDecimalChange,
    wholePlaceholder = '-',
    decimalPlaceholder = '---',
    className = 'h-10',
    compact = false,
}: {
    wholeValue: string;
    decimalValue: string;
    onWholeChange: (next: string) => void;
    onDecimalChange: (next: string) => void;
    wholePlaceholder?: string;
    decimalPlaceholder?: string;
    className?: string;
    compact?: boolean;
}) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const wholeRef = useRef<HTMLInputElement | null>(null);
    const decimalRef = useRef<HTMLInputElement | null>(null);

    const focusByPosition = (clientX: number) => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        const ratio = (clientX - rect.left) / rect.width;
        if (ratio <= 0.58) {
            wholeRef.current?.focus();
        } else {
            decimalRef.current?.focus();
        }
    };

    return (
        <div
            ref={rootRef}
            className={`grid min-w-0 ${compact ? 'grid-cols-[minmax(0,34px)_8px_24px]' : 'grid-cols-[minmax(0,1fr)_12px_44px]'} items-center overflow-hidden rounded-lg border border-slate-800 bg-slate-900 focus-within:border-cyan-500 ${className}`}
            onMouseDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.tagName === 'INPUT') return;
                event.preventDefault();
                focusByPosition(event.clientX);
            }}
        >
            <input
                ref={wholeRef}
                type="text"
                inputMode="numeric"
                className={`h-full min-w-0 bg-transparent ${compact ? 'px-1.5' : 'px-2'} text-center text-sm font-black text-white placeholder:text-slate-500 focus:outline-none`}
                value={wholeValue}
                placeholder={wholePlaceholder}
                onChange={(event) => onWholeChange(event.target.value.replace(/\D/g, ''))}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowRight' && (event.currentTarget.selectionStart || 0) === event.currentTarget.value.length) {
                        decimalRef.current?.focus();
                    }
                }}
            />
            <div className="pointer-events-none flex h-full items-center justify-center text-sm font-black text-slate-500">.</div>
            <input
                ref={decimalRef}
                type="text"
                inputMode="numeric"
                className={`h-full w-full min-w-0 bg-transparent ${compact ? 'px-0.5' : 'px-1'} text-center text-sm font-black text-white placeholder:text-slate-500 focus:outline-none`}
                value={decimalValue}
                placeholder={decimalPlaceholder}
                onChange={(event) => onDecimalChange(event.target.value.replace(/\D/g, '').slice(0, 3))}
                onKeyDown={(event) => {
                    if ((event.key === 'ArrowLeft' || event.key === 'Backspace') && (event.currentTarget.selectionStart || 0) === 0) {
                        wholeRef.current?.focus();
                    }
                }}
            />
        </div>
    );
}

export function PrefixedNumericField({
    prefix,
    value,
    onChange,
    placeholder = '-',
    className = 'h-10',
    allowDecimal = true,
}: {
    prefix?: string;
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    className?: string;
    allowDecimal?: boolean;
}) {
    return (
        <div className={`flex min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 focus-within:border-cyan-500 ${className}`}>
            {prefix ? (
                <div className="flex w-10 shrink-0 items-center justify-center border-r border-slate-800 text-sm font-black text-cyan-300">
                    {prefix}
                </div>
            ) : null}
            <input
                type="text"
                inputMode={allowDecimal ? 'decimal' : 'numeric'}
                className="h-full w-full min-w-0 bg-transparent px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(sanitizeUnsignedNumericDraft(event.target.value, allowDecimal))}
            />
        </div>
    );
}
