'use client';

export default function Sanity() {
    return (
        <div className="p-4 border-2 border-cyan-400 text-cyan-400 mt-4 rounded">
            LOCAL CLIENT COMPONENT WORKING
            <div className="text-xs mt-1 text-cyan-200">
                Imported via relative path ./Sanity
            </div>
        </div>
    );
}
