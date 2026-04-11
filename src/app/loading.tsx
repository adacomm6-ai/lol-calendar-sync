
export default function Loading() {
    return (
        <div className="flex h-[50vh] w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                {/* Animated Spinner or Logo */}
                <div className="relative h-16 w-16">
                    <div className="absolute inset-0 animate-ping rounded-full bg-blue-500 opacity-20"></div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-slate-800 border-t-blue-500 animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center font-bold text-blue-500 text-xs">LOL</div>
                </div>
                <div className="text-slate-500 text-sm font-mono animate-pulse">Loading Data...</div>
            </div>
        </div>
    );
}
