// src/app/api/assessment/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
  const token = extractTokenFromHeader(request.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
  }

  const decodedToken = authenticateToken(token);
  if (!decodedToken || !decodedToken.userId) {
    return NextResponse.json({ success: false, message: 'توکن نامعتبر است' }, { status: 401 });
  }

  try {
    const { userId } = decodedToken;
    let availableQuestionnaires: RowDataPacket[];

    // ✅ منطق نهایی و کاملاً اصلاح شده برای تفکیک کاربران
    if (decodedToken.organizationId && typeof decodedToken.organizationId === 'number') {
      // حالت اول: کاربر سازمانی است -> فقط پرسشنامه‌های آن سازمان را بگیر
      const organizationId = decodedToken.organizationId;
      [availableQuestionnaires] = await pool.query<RowDataPacket[]>(`
        SELECT q.id, q.name as title, q.description
        FROM questionnaires q
        JOIN organization_questionnaires oq ON q.id = oq.questionnaire_id
        WHERE oq.organization_id = ?
      `, [organizationId]);
    } else {
      // حالت دوم: کاربر عادی است -> تمام پرسشنامه‌ها را بگیر
      [availableQuestionnaires] = await pool.query<RowDataPacket[]>('SELECT id, name as title, description FROM questionnaires');
    }

    const [completedAssessments] = await pool.query<RowDataPacket[]>(
      'SELECT questionnaire_id FROM assessments WHERE user_id = ? AND completed_at IS NOT NULL',
      [userId]
    );
    const completedIds = new Set(completedAssessments.map(a => a.questionnaire_id));

    let isFirstUncompletedFound = false;
    const assessmentsWithStatus = availableQuestionnaires.map((q) => {
      let status: 'completed' | 'current' | 'locked' = 'locked';
      if (completedIds.has(q.id)) {
        status = 'completed';
      } else if (!isFirstUncompletedFound) {
        status = 'current';
        isFirstUncompletedFound = true;
      }
      return {
        id: q.id,
        stringId: `q${q.id}`,
        title: q.title,
        description: q.description,
        path: `/assessment/${q.id}`,
        status,
      };
    });

    if (assessmentsWithStatus.length > 0 && !isFirstUncompletedFound) {
      // همه ارزیابی‌ها انجام شده‌اند
    } else if (assessmentsWithStatus.length > 0 && !assessmentsWithStatus.some(a => a.status === 'current')) {
      // اگر هیچ ارزیابی در حال انجام نبود، اولین مورد را 'current' کن
      assessmentsWithStatus[0].status = 'current';
    }

    return NextResponse.json({ success: true, data: assessmentsWithStatus });
  } catch (error: any) {
    console.error('Assessment Status Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
