// src/app/api/admin/blog/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const isValidImageUrl = (value?: string | null) => {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('uploads/') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  );
};

const coverImageSchema = z
  .string()
  .trim()
  .refine(isValidImageUrl, { message: 'آدرس تصویر معتبر نیست.' });

const blogPostSchema = z.object({
  title: z.string().min(3, { message: 'عنوان باید حداقل ۳ کاراکتر باشد.' }),
  slug: z
    .string()
    .min(3, { message: 'اسلاگ باید حداقل ۳ کاراکتر باشد.' })
    .regex(/^[a-z0-9-]+$/i, { message: 'اسلاگ فقط می‌تواند شامل حروف، اعداد و خط تیره باشد.' }),
  excerpt: z
    .string()
    .min(10, { message: 'خلاصه باید حداقل ۱۰ کاراکتر باشد.' })
    .max(400, { message: 'خلاصه حداکثر می‌تواند ۴۰۰ کاراکتر باشد.' })
    .optional(),
  content: z.string().min(100, { message: 'متن مقاله باید حداقل ۱۰۰ کاراکتر باشد.' }),
  cover_image_url: coverImageSchema.optional(),
  author: z
    .string()
    .min(2, { message: 'نام نویسنده باید حداقل ۲ کاراکتر باشد.' })
    .max(100, { message: 'نام نویسنده حداکثر می‌تواند ۱۰۰ کاراکتر باشد.' })
    .optional(),
  is_published: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const [rows]: any = await db.query(
      `
        SELECT id, title, slug, excerpt, cover_image_url, author, is_published, published_at, created_at, updated_at
        FROM blog_posts
        ORDER BY created_at DESC
      `
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin Get Blog Posts Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const body = await request.json();
    const validation = blogPostSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const {
      title,
      slug,
      excerpt,
      content,
      cover_image_url,
      author,
      is_published = true,
    } = validation.data;

    const normalizedContent = content.trim();
    const normalizedExcerptRaw = (excerpt?.trim() || normalizedContent.slice(0, 220)).trim();
    const normalizedExcerpt =
      normalizedExcerptRaw.length > 400
        ? `${normalizedExcerptRaw.slice(0, 397)}...`
        : normalizedExcerptRaw;
    const normalizedCover = cover_image_url && cover_image_url !== '' ? cover_image_url : null;
    const normalizedAuthor = (author?.trim() || 'تیم بوته');
    const publishDate = is_published ? new Date() : null;

    await db.query(
      `
        INSERT INTO blog_posts (title, slug, excerpt, content, cover_image_url, author, is_published, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        title.trim(),
        slug.trim().toLowerCase(),
        normalizedExcerpt,
        normalizedContent,
        normalizedCover,
        normalizedAuthor,
        is_published ? 1 : 0,
        publishDate,
      ]
    );

    return NextResponse.json({ success: true, message: 'مقاله جدید با موفقیت ثبت شد.' });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { success: false, message: 'اسلاگ انتخاب شده تکراری است.' },
        { status: 400 }
      );
    }
    console.error('Admin Create Blog Post Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
