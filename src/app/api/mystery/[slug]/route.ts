// src/app/api/mystery/[slug]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    if (!slug) {
      return NextResponse.json({ success: false, message: 'شناسه آزمون نامعتبر است.' }, { status: 400 });
    }

    const [testRows]: any = await db.query(
      `
        SELECT id, name, slug, short_description, intro_message, guide_name, bubble_prompt, created_at
        FROM mystery_assessments
        WHERE slug = ? AND is_active = 1
        LIMIT 1
      `,
      [slug]
    );

    if (!Array.isArray(testRows) || testRows.length === 0) {
      return NextResponse.json({ success: false, message: 'آزمون مورد نظر یافت نشد.' }, { status: 404 });
    }

    const assessment = testRows[0];

    const [imageRows]: any = await db.query(
      `
        SELECT id, title, description, image_url, display_order
        FROM mystery_assessment_images
        WHERE mystery_assessment_id = ?
        ORDER BY display_order ASC, id ASC
      `,
      [assessment.id]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...assessment,
        images: imageRows,
      },
    });
  } catch (error) {
    console.error('Get Mystery Assessment Detail Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
