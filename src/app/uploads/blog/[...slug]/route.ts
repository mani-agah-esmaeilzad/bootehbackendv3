// src/app/uploads/blog/[...slug]/route.ts

import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const ALLOWED_ROOT = path.join(process.cwd(), 'public', 'uploads', 'blog');

const getContentType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
};

export async function GET(
  _request: Request,
  context: { params: { slug: string[] } },
) {
  try {
    const segments = context.params.slug ?? [];
    const relativePath = segments.map((segment) => decodeURIComponent(segment)).join('/');
    if (!relativePath) {
      return NextResponse.json({ success: false, message: 'تصویر یافت نشد.' }, { status: 404 });
    }

    const requestedPath = path.join(ALLOWED_ROOT, relativePath);
    if (!requestedPath.startsWith(ALLOWED_ROOT)) {
      return NextResponse.json({ success: false, message: 'مسیر درخواست معتبر نیست.' }, { status: 400 });
    }

    const fileStat = await stat(requestedPath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ success: false, message: 'تصویر یافت نشد.' }, { status: 404 });
    }

    const fileBuffer = await readFile(requestedPath);
    const contentType = getContentType(requestedPath);

    const uint8Array = new Uint8Array(
      fileBuffer.buffer as ArrayBuffer,
      fileBuffer.byteOffset,
      fileBuffer.byteLength,
    );

    const response = new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

    return response;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ success: false, message: 'تصویر یافت نشد.' }, { status: 404 });
    }
    console.error('Blog upload serve error:', error);
    return NextResponse.json({ success: false, message: 'خطا در دریافت تصویر.' }, { status: 500 });
  }
}
