import { promises as fs } from 'fs';
import path from 'path';

function sanitizeFilename(filename: string): string {
    const safe = String(filename || '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return safe || `upload_${Date.now()}.png`;
}

export async function uploadToSupabase(
    fileBuffer: Buffer,
    filename: string,
    _contentType: string = 'image/png'
): Promise<string> {
    const safeName = sanitizeFilename(filename);
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const target = path.join(uploadsDir, safeName);

    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(target, fileBuffer);

    return `/api/uploads/${safeName}`;
}
