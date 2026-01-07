// src/app/api/assessment/final-report/route.ts

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import {
  AssignmentInfo,
  CompletedAssessmentInfo,
  UserBasicInfo,
  transformCompletionRow,
  buildAggregatedFinalReport,
} from '@/lib/finalReports';
import { mockFinalReport } from '@/data/mockAssessment';

const ASSESSMENT_MOCK_MODE = process.env.ASSESSMENT_MOCK_MODE !== 'off';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (ASSESSMENT_MOCK_MODE) {
      return NextResponse.json({
        success: true,
        mock: true,
        data: mockFinalReport.data,
      });
    }

    const session = await getSession();
    const userId = session.user?.userId;
    if (!userId) {
      return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 401 });
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
    let assignmentRowPackets: AssignmentRow[] = [];
    try {
      const [rows] = await db.query<AssignmentRow[]>(
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
      assignmentRowPackets = rows;
    } catch (assignmentError) {
      console.error("Final report: failed to load user assignments, falling back to completions.", assignmentError);
      assignmentRowPackets = [];
    }

    const assignmentRows: AssignmentInfo[] = assignmentRowPackets.map((row) => ({
      user_id: row.user_id,
      questionnaire_id: row.questionnaire_id,
      questionnaire_title: row.questionnaire_title,
      display_order: row.display_order,
      category: row.category,
      max_score: row.max_score,
    }));

    type CompletionRow = RowDataPacket & CompletedAssessmentInfo;
    const [completedRows] = await db.query<CompletionRow[]>(
      `SELECT 
          a.id AS assessment_id,
          a.user_id,
          a.questionnaire_id,
          q.name AS questionnaire_title,
          q.display_order AS questionnaire_display_order,
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

    const buildFallbackAssignments = (rows: CompletedAssessmentInfo[]): AssignmentInfo[] => {
      if (!rows || rows.length === 0) return [];
      const dedupe = new Map<number, AssignmentInfo>();
      rows
        .slice()
        .sort((a, b) => {
          const orderA = a.questionnaire_display_order ?? 0;
          const orderB = b.questionnaire_display_order ?? 0;
          return orderA - orderB;
        })
        .forEach((row, index) => {
          if (dedupe.has(row.questionnaire_id)) return;
          dedupe.set(row.questionnaire_id, {
            user_id: row.user_id,
            questionnaire_id: row.questionnaire_id,
            questionnaire_title: row.questionnaire_title,
            display_order: row.questionnaire_display_order !== null ? row.questionnaire_display_order : index,
            category: row.category,
            max_score: row.max_score ?? null,
          });
        });
      return Array.from(dedupe.values());
    };

    let effectiveAssignments = assignmentRows;
    if (!effectiveAssignments || effectiveAssignments.length === 0) {
      effectiveAssignments = buildFallbackAssignments(completedRows);
      if (effectiveAssignments.length === 0) {
        return NextResponse.json(
          { success: false, message: 'هنوز مسیری برای شما تعریف نشده است' },
          { status: 404 },
        );
      }
    }

    const parsedCompletions = completedRows.map((row) => transformCompletionRow(row));
    const aggregated = buildAggregatedFinalReport(userInfo, effectiveAssignments, parsedCompletions);

    if (!aggregated) {
      return NextResponse.json(
        { success: false, message: 'داده‌ای برای نمایش وجود ندارد' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
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
    console.error('Get User Final Report Error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
