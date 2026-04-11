'use client';

import React from 'react';

interface AnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export default function AnalysisModal({ isOpen, onClose, children }: AnalysisModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
            onClick={onClose}
        >
            <div
                className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-6xl my-2 sm:my-3 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 right-0 z-10 flex justify-end p-3">
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800/90 backdrop-blur-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-lg"
                    >
                        ✕
                    </button>
                </div>
                <div className="px-4 sm:px-6 pb-6 -mt-4">
                    {children}
                </div>
            </div>
        </div>
    );
}
