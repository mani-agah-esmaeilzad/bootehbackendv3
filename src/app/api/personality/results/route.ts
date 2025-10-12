// src/app/api/personality/results/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای مشاهده نتایج وارد شوید.' }, { status: 401 });
    }

    const [rows]: any = await db.query(
      `SELECT ps.session_uuid, ps.status, ps.results, ps.created_at, ps.updated_at,
              pa.name, pa.slug, pa.report_name
         FROM personality_sessions ps
         JOIN personality_assessments pa ON ps.personality_assessment_id = pa.id
        WHERE ps.user_id = ?
        ORDER BY ps.created_at DESC`,
      [session.user.userId]
    );

    const data = Array.isArray(rows)
      ? rows.map((row) => {
          let parsedResults: any = null;
          if (row.results) {
            try {
              parsedResults = JSON.parse(row.results);
            } catch (error) {
              console.error('Failed to parse personality result JSON', error);
            }
          }
          return {
            sessionId: row.session_uuid,
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
            name: row.name,
            slug: row.slug,
            report_name: row.report_name,
            results: parsedResults,
          };
        })
      : [];

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('List personality results error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
