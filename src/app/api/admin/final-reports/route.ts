// src/app/api/admin/final-reports/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import {
  AssignmentInfo,
  CompletedAssessmentInfo,
  UserBasicInfo,
  transformCompletionRow,
  buildAggregatedFinalReport,
} from '@/lib/finalReports';

export const dynamic = 'force-dynamic';

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (items.length === 0 || size <= 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export async function GET() {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });
    }

    const [assignmentRows] = await db.query<AssignmentInfo[]>(
      `SELECT 
          uqa.user_id,
          uqa.questionnaire_id,
          uqa.display_order,
          q.name AS questionnaire_title,
          q.category,
          NULL AS max_score
       FROM user_questionnaire_assignments uqa
       JOIN questionnaires q ON q.id = uqa.questionnaire_id
       ORDER BY uqa.user_id ASC, uqa.display_order ASC, q.display_order ASC, q.id ASC`,
    );

    if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const userIds = Array.from(new Set(assignmentRows.map((row) => row.user_id)));

    const [userRows] = await db.query<UserBasicInfo[]>(
      `SELECT id, username, first_name, last_name, email, is_active 
       FROM users
       WHERE id IN (${userIds.map(() => '?').join(',')})`,
      userIds,
    );

    const userMap = new Map<number, UserBasicInfo>();
    userRows.forEach((row) => userMap.set(row.id, row));

    const assignmentsByUser = new Map<number, AssignmentInfo[]>();
    assignmentRows.forEach((assignment) => {
      const bucket = assignmentsByUser.get(assignment.user_id) ?? [];
      bucket.push(assignment);
      assignmentsByUser.set(assignment.user_id, bucket);
    });

    const completionsByUser = new Map<number, CompletedAssessmentInfo[]>();

    // Fetch completed assessments in manageable chunks to avoid parameter limits.
    const userChunks = chunkArray(userIds, 128);
    for (const chunk of userChunks) {
      const [completedRows] = await db.query<CompletedAssessmentInfo[]>(
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
         WHERE a.status = 'completed' AND a.user_id IN (${chunk.map(() => '?').join(',')})`,
        chunk,
      );
      completedRows.forEach((row) => {
        const bucket = completionsByUser.get(row.user_id) ?? [];
        bucket.push(row);
        completionsByUser.set(row.user_id, bucket);
      });
    }

    const summaries = Array.from(assignmentsByUser.entries()).flatMap(([userId, userAssignments]) => {
      const userInfo = userMap.get(userId);
      if (!userInfo) return [];
      const parsedCompletions = (completionsByUser.get(userId) ?? []).map((row) => transformCompletionRow(row));
      const aggregated = buildAggregatedFinalReport(userInfo, userAssignments, parsedCompletions);
      if (!aggregated) return [];

      return [
        {
          userId: userInfo.id,
          username: userInfo.username,
          first_name: userInfo.first_name,
          last_name: userInfo.last_name,
          email: userInfo.email,
          is_active: Boolean(userInfo.is_active),
          assignedCount: aggregated.assignedCount,
          completedCount: aggregated.completedCount,
          completionPercent: Math.round(aggregated.completionRate * 100),
          isReady: aggregated.isReady,
          lastCompletedAt: aggregated.lastCompletedAt,
          overallScore: aggregated.overallNormalized,
          categoryScores: aggregated.categories.map((category) => ({
            label: category.label,
            normalizedScore: category.normalizedScore,
            completedCount: category.completedCount,
            totalAssignments: category.totalAssignments,
          })),
        },
      ];
    });

    summaries.sort((a, b) => {
      if (a.isReady !== b.isReady) return a.isReady ? -1 : 1;
      if (b.completionPercent !== a.completionPercent) return b.completionPercent - a.completionPercent;
      if (a.lastCompletedAt && b.lastCompletedAt) {
        return b.lastCompletedAt.localeCompare(a.lastCompletedAt);
      }
      if (a.lastCompletedAt) return -1;
      if (b.lastCompletedAt) return 1;
      return a.username.localeCompare(b.username, 'fa');
    });

    return NextResponse.json({ success: true, data: summaries });
  } catch (error) {
    console.error('Get Final Reports Summary Error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
