export const dynamic = "force-dynamic";

import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <h1 className="text-9xl font-black text-white/5 absolute -z-10 select-none">404</h1>
            <div className="space-y-4">
                <h2 className="text-4xl font-black text-white tracking-widest uppercase">Page Not Found</h2>
                <p className="text-slate-400 max-w-md mx-auto font-medium">
                    The data point you are looking for does not exist in our current archives.
                </p>
                <div className="pt-8">
                    <Link
                        href="/"
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                        Return to Control Center
                    </Link>
                </div>
            </div>
        </div>
    );
}
