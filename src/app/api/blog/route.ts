// src/app/api/blog/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

const sanitizeLimit = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 50);
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = sanitizeLimit(searchParams.get('limit'));

    const baseQuery = `
      SELECT id, title, slug, excerpt, cover_image_url, author, published_at, created_at
      FROM blog_posts
      WHERE is_published = 1
      ORDER BY COALESCE(published_at, created_at) DESC
    `;

    const [rows]: any = limit
      ? await db.query(`${baseQuery} LIMIT ?`, [limit])
      : await db.query(baseQuery);

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get Blog Posts Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
