// src/app/api/personality/results/[sessionId]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای مشاهده گزارش وارد شوید.' }, { status: 401 });
    }

    const sessionUuid = params.sessionId;
    if (!sessionUuid) {
      return NextResponse.json({ success: false, message: 'شناسه گزارش معتبر نیست.' }, { status: 400 });
    }

    const [rows]: any = await db.query(
      `SELECT ps.session_uuid, ps.status, ps.results, ps.created_at, ps.updated_at,
              pa.name, pa.slug, pa.report_name
         FROM personality_sessions ps
         JOIN personality_assessments pa ON ps.personality_assessment_id = pa.id
        WHERE ps.session_uuid = ? AND ps.user_id = ?
        LIMIT 1`,
      [sessionUuid, session.user.userId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, message: 'گزارش یافت نشد.' }, { status: 404 });
    }

    const row = rows[0];
    let parsedResults: any = null;
    if (row.results) {
      try {
        parsedResults = JSON.parse(row.results);
      } catch (error) {
        console.error('Unable to parse personality result JSON', error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: row.session_uuid,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        name: row.name,
        slug: row.slug,
        report_name: row.report_name,
        results: parsedResults,
      },
    });
  } catch (error) {
    console.error('Get personality result error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
