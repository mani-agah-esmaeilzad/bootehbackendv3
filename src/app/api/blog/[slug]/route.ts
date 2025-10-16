// src/app/api/blog/[slug]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    const [rows]: any = await db.query(
      `
        SELECT id, title, slug, excerpt, content, cover_image_url, author, published_at, created_at, updated_at
        FROM blog_posts
        WHERE slug = ? AND is_published = 1
        LIMIT 1
      `,
      [slug]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, message: 'مقاله مورد نظر یافت نشد.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get Blog Post Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
