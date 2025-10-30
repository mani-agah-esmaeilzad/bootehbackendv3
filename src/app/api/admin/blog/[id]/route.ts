// src/app/api/admin/blog/[id]/route.ts

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

const normalizeExcerpt = (excerpt: string | undefined, content: string) => {
  const normalizedContent = content.trim();
  const rawExcerpt = (excerpt?.trim() || normalizedContent.slice(0, 220)).trim();
  if (!rawExcerpt) {
    return normalizedContent.slice(0, 220);
  }
  return rawExcerpt.length > 400 ? `${rawExcerpt.slice(0, 397)}...` : rawExcerpt;
};

const normalizeCoverImage = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeAuthor = (author?: string | null) => {
  const trimmed = author?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'تیم بوته';
};

export async function PUT(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, message: 'شناسه مقاله معتبر نیست.' }, { status: 400 });
    }

    const [existingRows]: any[] = await db.query(
      'SELECT id, is_published, published_at FROM blog_posts WHERE id = ? LIMIT 1',
      [id]
    );
    const existingPost = existingRows?.[0];

    if (!existingPost) {
      return NextResponse.json({ success: false, message: 'مقاله مورد نظر یافت نشد.' }, { status: 404 });
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
    const normalizedExcerpt = normalizeExcerpt(excerpt, normalizedContent);
    const normalizedCover = normalizeCoverImage(cover_image_url);
    const normalizedAuthor = normalizeAuthor(author);

    const publishDate = is_published
      ? existingPost.published_at ?? new Date()
      : null;

    await db.query(
      `
        UPDATE blog_posts
        SET title = ?, slug = ?, excerpt = ?, content = ?, cover_image_url = ?, author = ?, is_published = ?, published_at = ?
        WHERE id = ?
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
        id,
      ]
    );

    return NextResponse.json({ success: true, message: 'مقاله با موفقیت به‌روزرسانی شد.' });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { success: false, message: 'اسلاگ انتخاب شده تکراری است.' },
        { status: 400 }
      );
    }

    console.error('Admin Update Blog Post Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, message: 'شناسه مقاله معتبر نیست.' }, { status: 400 });
    }

    const [existingRows]: any[] = await db.query(
      'SELECT id FROM blog_posts WHERE id = ? LIMIT 1',
      [id]
    );

    if (!existingRows?.[0]) {
      return NextResponse.json({ success: false, message: 'مقاله مورد نظر یافت نشد.' }, { status: 404 });
    }

    await db.query('DELETE FROM blog_posts WHERE id = ?', [id]);

    return NextResponse.json({ success: true, message: 'مقاله با موفقیت حذف شد.' });
  } catch (error) {
    console.error('Admin Delete Blog Post Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
