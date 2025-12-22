// src/app/api/admin/final-reports/route.ts

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
       ORDER BY uqa.user_id ASC, uqa.display_order ASC, q.display_order ASC, q.id ASC`,
    );

    const assignmentUserIds = Array.from(new Set(assignmentRows.map((row) => row.user_id)));

    type CompletionUserRow = RowDataPacket & { user_id: number };
    const [completionUserRows] = await db.query<CompletionUserRow[]>(
      `SELECT DISTINCT user_id FROM assessments WHERE status = 'completed'`,
    );
    const completionUserIds = completionUserRows.map((row) => row.user_id);

    const allUserIdsSet = new Set<number>([...assignmentUserIds, ...completionUserIds]);
    if (allUserIdsSet.size === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    const allUserIds = Array.from(allUserIdsSet);

    type UserRow = RowDataPacket & UserBasicInfo;
    const [userRows] = await db.query<UserRow[]>(
      `SELECT id, username, first_name, last_name, email, is_active 
       FROM users
       WHERE id IN (${allUserIds.map(() => '?').join(',')})`,
      allUserIds,
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
    const userChunks = chunkArray(allUserIds, 128);
    for (const chunk of userChunks) {
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
         WHERE a.status = 'completed' AND a.user_id IN (${chunk.map(() => '?').join(',')})`,
        chunk,
      );
      completedRows.forEach((row) => {
        const bucket = completionsByUser.get(row.user_id) ?? [];
        bucket.push(row);
        completionsByUser.set(row.user_id, bucket);
      });
    }

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
            display_order:
              row.questionnaire_display_order !== null
                ? row.questionnaire_display_order
                : index,
            category: row.category,
            max_score: row.max_score ?? null,
          });
        });
      return Array.from(dedupe.values());
    };

    const candidateUserIds = Array.from(
      new Set<number>([
        ...assignmentsByUser.keys(),
        ...completionsByUser.keys(),
      ]),
    );

    const normalizeLastCompletedAt = (value: string | null) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
    };

    const summaries = candidateUserIds.flatMap((userId) => {
      const userInfo = userMap.get(userId);
      if (!userInfo) return [];
      let userAssignments = assignmentsByUser.get(userId) ?? [];
      if (userAssignments.length === 0) {
        const fallback = buildFallbackAssignments(completionsByUser.get(userId) ?? []);
        if (fallback.length === 0) return [];
        userAssignments = fallback;
        assignmentsByUser.set(userId, fallback);
      }
      const parsedCompletions = (completionsByUser.get(userId) ?? []).map((row) => transformCompletionRow(row));
      const aggregated = buildAggregatedFinalReport(userInfo, userAssignments, parsedCompletions);
      if (!aggregated) return [];
      const lastCompletedAt = normalizeLastCompletedAt(aggregated.lastCompletedAt);

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
          lastCompletedAt,
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

    const parseTimestamp = (value: string | null) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    };

    summaries.sort((a, b) => {
      if (a.isReady !== b.isReady) return a.isReady ? -1 : 1;
      if (b.completionPercent !== a.completionPercent) return b.completionPercent - a.completionPercent;
      if (a.lastCompletedAt && b.lastCompletedAt) {
        const timeA = parseTimestamp(a.lastCompletedAt);
        const timeB = parseTimestamp(b.lastCompletedAt);
        if (timeA && timeB) return timeB - timeA;
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
