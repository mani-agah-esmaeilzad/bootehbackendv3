// src/app/api/admin/user-stages/route.ts

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT 
         u.id,
         u.username,
         u.first_name,
         u.last_name,
         u.email,
         u.is_active,
         u.created_at,
         COUNT(uqa.questionnaire_id) AS assignment_count,
         MAX(uqa.updated_at) AS assignments_updated_at
       FROM users u
       LEFT JOIN user_questionnaire_assignments uqa ON uqa.user_id = u.id
       GROUP BY 
         u.id,
         u.username,
         u.first_name,
         u.last_name,
         u.email,
         u.is_active,
         u.created_at
       ORDER BY u.created_at DESC`
    );

    const summaries = rows.map((row: any) => ({
      id: row.id,
      username: row.username,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      assignment_count: Number(row.assignment_count || 0),
      assignments_updated_at: row.assignments_updated_at,
    }));

    return NextResponse.json({ success: true, data: summaries });
  } catch (error) {
    console.error('Get User Stage Assignments Error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
