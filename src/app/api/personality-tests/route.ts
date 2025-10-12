// src/app/api/personality-tests/route.ts

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

export async function GET() {
  try {
    const [rows]: any = await db.query(
      `SELECT id, name, slug, tagline, description, report_name, highlights 
       FROM personality_assessments 
       WHERE is_active = 1
       ORDER BY id ASC`
    );

    const data = rows.map((row: any) => ({
      ...row,
      highlights: parseHighlights(row.highlights),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Get Personality Tests Error:", error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
