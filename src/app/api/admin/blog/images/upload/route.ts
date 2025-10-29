// src/app/api/admin/blog/images/upload/route.ts

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, message: 'فایل ارسال نشده است.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: 'حجم فایل بیش از حد مجاز است (۵ مگابایت).' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, message: 'فرمت تصویر پشتیبانی نمی‌شود. فقط JPEG، PNG یا WEBP مجاز است.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'blog');
    await mkdir(uploadDir, { recursive: true });

    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '.jpg';
    const uniqueName = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
    const filePath = path.join(uploadDir, uniqueName);

    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/blog/${uniqueName}`;

    return NextResponse.json({ success: true, data: { url: publicUrl } });
  } catch (error) {
    console.error('Admin blog image upload error:', error);
    return NextResponse.json({ success: false, message: 'خطا در آپلود تصویر' }, { status: 500 });
  }
}
