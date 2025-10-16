// src/app/uploads/[...path]/route.ts

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export async function GET(
  request: Request,
  { params }: { params: { path?: string[] } }
) {
  try {
    const segments = params.path ?? [];

    if (!Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json(
        { success: false, message: 'مسیر فایل نامعتبر است.' },
        { status: 400 }
      );
    }

    // جلوگیری از مسیرهای خطرناک
    const safeSegments = segments.filter(Boolean).map((segment) => {
      const decoded = decodeURIComponent(segment);
      if (decoded.includes('..') || decoded.startsWith('/') || decoded.includes('\\')) {
        throw new Error('Invalid path segment');
      }
      return decoded;
    });

    const filePath = path.join(process.cwd(), 'public', 'uploads', ...safeSegments);
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    // ✅ تبدیل امن Buffer به ArrayBuffer برای Response
    const arrayBuffer = new Uint8Array(data).buffer;

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return NextResponse.json(
        { success: false, message: 'فایل یافت نشد.' },
        { status: 404 }
      );
    }

    console.error('Static upload serving error:', error);
    return NextResponse.json(
      { success: false, message: 'خطای داخلی سرور' },
      { status: 500 }
    );
  }
}
