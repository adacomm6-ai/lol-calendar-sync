import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    try {
        const decodedUrl = decodeURIComponent(url);

        // 1. Fetch image from remote server
        const response = await fetch(decodedUrl, {
            headers: {
                // Faking user agent to bypass basic hotlink protections
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Referer': new URL(decodedUrl).origin
            },
            // Avoid hanging forever
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) {
            console.error(`[Image Proxy] Failed to fetch targeting ${decodedUrl}: ${response.status}`);
            return new NextResponse('Failed to fetch image', { status: response.status });
        }

        // 2. Extract content type
        const contentType = response.headers.get('content-type') || 'image/png';
        const buffer = await response.arrayBuffer();

        // 3. Return image with max aggressively caching
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*' // Optional, if needed
            }
        });

    } catch (e: any) {
        console.error(`[Image Proxy] Network error for ${url}:`, e);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
