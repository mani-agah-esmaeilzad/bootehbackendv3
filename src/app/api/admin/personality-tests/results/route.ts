// src/app/api/admin/personality-tests/results/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const [rows]: any = await db.query(
      `SELECT ps.session_uuid, ps.status, ps.results, ps.created_at, ps.updated_at,
              u.id AS user_id, CONCAT(u.first_name, ' ', u.last_name) AS full_name, u.email,
              pa.name AS assessment_name, pa.slug, pa.report_name
         FROM personality_sessions ps
         JOIN users u ON ps.user_id = u.id
         JOIN personality_assessments pa ON ps.personality_assessment_id = pa.id
        ORDER BY ps.created_at DESC`
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
            assessment_name: row.assessment_name,
            slug: row.slug,
            report_name: row.report_name,
            user: {
              id: row.user_id,
              full_name: row.full_name,
              email: row.email,
            },
            results: parsedResults,
          };
        })
      : [];

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Admin personality results error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
