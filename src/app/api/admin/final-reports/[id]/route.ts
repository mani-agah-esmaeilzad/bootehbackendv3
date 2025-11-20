// src/app/api/admin/final-reports/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { RowDataPacket } from 'mysql2';
import {
  AssignmentInfo,
  CompletedAssessmentInfo,
  UserBasicInfo,
  transformCompletionRow,
  buildAggregatedFinalReport,
} from '@/lib/finalReports';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });
    }

    const userId = Number(params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ success: false, message: 'شناسه کاربر نامعتبر است' }, { status: 400 });
    }

    type UserRow = RowDataPacket & UserBasicInfo;
    const [userRows] = await db.query<UserRow[]>(
      `SELECT id, username, first_name, last_name, email, is_active
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    );

    if (!Array.isArray(userRows) || userRows.length === 0) {
      return NextResponse.json({ success: false, message: 'کاربر یافت نشد' }, { status: 404 });
    }

    const userInfo = userRows[0];

    type AssignmentRow = RowDataPacket & AssignmentInfo;
    const [assignmentRows] = await db.query<AssignmentRow[]>(
      `SELECT 
          uqa.user_id,
          uqa.questionnaire_id,
          uqa.display_order,
          q.name AS questionnaire_title,
          q.category,
          NULL AS max_score
       FROM user_questionnaire_assignments uqa
       JOIN questionnaires q ON q.id = uqa.questionnaire_id
       WHERE uqa.user_id = ?
       ORDER BY uqa.display_order ASC, q.display_order ASC, q.id ASC`,
      [userId],
    );

    if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) {
      return NextResponse.json({ success: false, message: 'هنوز مسیری برای این کاربر تعریف نشده است' }, { status: 404 });
    }

    type CompletionRow = RowDataPacket & CompletedAssessmentInfo;
    const [completedRows] = await db.query<CompletionRow[]>(
      `SELECT 
          a.id AS assessment_id,
          a.user_id,
          a.questionnaire_id,
          q.name AS questionnaire_title,
          q.category,
          a.completed_at,
          a.results,
          a.max_score
       FROM assessments a
       JOIN questionnaires q ON q.id = a.questionnaire_id
       WHERE a.status = 'completed' AND a.user_id = ?
       ORDER BY a.completed_at DESC`,
      [userId],
    );

    const parsedCompletions = completedRows.map((row) => transformCompletionRow(row));
    const aggregated = buildAggregatedFinalReport(userInfo, assignmentRows, parsedCompletions);

    if (!aggregated) {
      return NextResponse.json({ success: false, message: 'داده‌ای برای این کاربر ثبت نشده است' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: userInfo.id,
          username: userInfo.username,
          first_name: userInfo.first_name,
          last_name: userInfo.last_name,
          email: userInfo.email,
          is_active: Boolean(userInfo.is_active),
        },
        progress: {
          assignedCount: aggregated.assignedCount,
          completedCount: aggregated.completedCount,
          completionPercent: Math.round(aggregated.completionRate * 100),
          remainingCount: aggregated.assignedCount - aggregated.completedCount,
          isReady: aggregated.isReady,
          lastCompletedAt: aggregated.lastCompletedAt,
        },
        overview: {
          overallScore: aggregated.overallNormalized,
          averageScore: aggregated.averageScore,
        },
        categories: aggregated.categories,
        radar: aggregated.radar,
        powerWheel: aggregated.powerWheel,
        assessments: aggregated.assessments,
        pendingAssignments: aggregated.pendingAssignments,
        strengths: aggregated.strengths,
        recommendations: aggregated.recommendations,
        developmentPlan: aggregated.developmentPlan,
        risks: aggregated.risks,
      },
    });
  } catch (error) {
    console.error(`Get Final Report Detail Error (user ${params.id}):`, error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
