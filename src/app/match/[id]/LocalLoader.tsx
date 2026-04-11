'use client';

export function LocalLoader(props: any) {
    return (
        <div className="p-20 bg-pink-600 text-white font-bold text-3xl">
            LOADER WORKING - MINIMAL
            <div className="text-sm font-mono mt-4">
                ID: {props.match?.id}
            </div>
        </div>
    );
}
