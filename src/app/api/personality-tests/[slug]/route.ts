// src/app/api/personality-tests/[slug]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

const parseHighlights = (value: any): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const [rows]: any = await db.query(
      `SELECT id, name, slug, tagline, description, report_name, highlights, is_active 
       FROM personality_assessments 
       WHERE slug = ?`,
      [params.slug]
    );

    if (!rows.length) {
      return NextResponse.json({ success: false, message: 'آزمون یافت نشد' }, { status: 404 });
    }

    const test = rows[0];

    if (!test.is_active) {
      return NextResponse.json({ success: false, message: 'این آزمون در حال حاضر فعال نیست' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...test,
        highlights: parseHighlights(test.highlights),
      },
    });
  } catch (error) {
    console.error("Get Personality Test Detail Error:", error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
