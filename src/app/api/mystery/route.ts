// src/app/api/mystery/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [rows]: any = await db.query(`
      SELECT 
        ma.id,
        ma.name,
        ma.slug,
        ma.short_description,
        ma.created_at,
        (
          SELECT image_url
          FROM mystery_assessment_images mi
          WHERE mi.mystery_assessment_id = ma.id
          ORDER BY mi.display_order ASC, mi.id ASC
          LIMIT 1
        ) AS preview_image
      FROM mystery_assessments ma
      WHERE ma.is_active = 1
      ORDER BY ma.created_at DESC
    `);

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get Mystery Assessments Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
