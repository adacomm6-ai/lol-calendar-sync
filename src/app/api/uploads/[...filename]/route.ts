
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { readFile, stat } from 'fs/promises';
import mime from 'mime';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string[] }> }
) {
    const { filename } = await params;
    const filenameParts = Array.isArray(filename) ? filename : [filename].filter(Boolean);

    // Prevent directory traversal
    if (
        filenameParts.length === 0 ||
        filenameParts.some((part) => !part || part.includes('..') || part.includes('/') || part.includes('\\'))
    ) {
        return new NextResponse('Invalid filename', { status: 400 });
    }

    const filePath = join(process.cwd(), 'public', 'uploads', ...filenameParts);

    try {
        // Check if file exists
        await stat(filePath);

        // Read file
        const fileBuffer = await readFile(filePath);

        // Determine mime type
        const contentType = mime.getType(filenameParts.join('/')) || 'application/octet-stream';

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        return new NextResponse('File not found', { status: 404 });
    }
}
