'use client';

// import SafeReviewClient from './SafeReviewClient';

function InlineSafeClient() {
    return <div className="p-4 border border-pink-500 text-pink-500">INLINE COMPONENT WORKING</div>;
}

export default function MatchDetailView(props: any) {
    // const [mounted, setMounted] = useState(false);
    // useEffect(() => setMounted(true), []);

    // if (!mounted) return <div className="p-20 text-slate-500">Initializing Client...</div>;

    return (
        <div className="p-10 border-4 border-dashed border-slate-700 m-10">
            <h2 className="text-white mb-4">View Wrapper Validated (Inline Definition)</h2>
            <div className="text-red-500 font-bold mb-4">INLINE TEST</div>
            <InlineSafeClient />
        </div>
    );
}
