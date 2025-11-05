// src/app/api/admin/reports-overview/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type StatusRow = { status: string; total: number };

export async function GET() {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        const [totalsRows]: any = await db.query(
            `SELECT 
                COUNT(*) AS total_completed,
                COUNT(DISTINCT user_id) AS unique_users,
                COUNT(DISTINCT questionnaire_id) AS questionnaire_count,
                MAX(completed_at) AS last_completed_at
             FROM assessments
             WHERE status = 'completed'`
        );
        const totalsRow = Array.isArray(totalsRows) && totalsRows.length > 0 ? totalsRows[0] : {};

        const [statusRows]: any = await db.query(
            `SELECT status, COUNT(*) AS total
             FROM assessments
             GROUP BY status`
        );

        const [questionnaireRows]: any = await db.query(
            `SELECT 
                q.id,
                q.name,
                COUNT(a.id) AS total
             FROM assessments a
             JOIN questionnaires q ON q.id = a.questionnaire_id
             WHERE a.status = 'completed'
             GROUP BY q.id, q.name
             ORDER BY total DESC`
        );

        const [recentRows]: any = await db.query(
            `SELECT 
                a.id AS assessment_id,
                u.username,
                u.first_name,
                u.last_name,
                q.name AS questionnaire_title,
                a.completed_at
             FROM assessments a
             JOIN users u ON u.id = a.user_id
             JOIN questionnaires q ON q.id = a.questionnaire_id
             WHERE a.status = 'completed'
             ORDER BY a.completed_at DESC
             LIMIT 8`
        );

        const totals = {
            totalCompleted: Number(totalsRow?.total_completed ?? 0),
            uniqueUsers: Number(totalsRow?.unique_users ?? 0),
            questionnaireCount: Number(totalsRow?.questionnaire_count ?? 0),
            lastCompletedAt: totalsRow?.last_completed_at ?? null,
        };

        const statusBreakdown = (statusRows as StatusRow[]).map((row) => ({
            status: row.status,
            total: Number(row.total) || 0,
        }));

        const assessmentsByQuestionnaire = questionnaireRows.map((row: any) => ({
            id: row.id,
            title: row.name,
            total: Number(row.total) || 0,
        }));

        const recentAssessments = recentRows.map((row: any) => ({
            assessmentId: row.assessment_id,
            username: row.username,
            firstName: row.first_name,
            lastName: row.last_name,
            questionnaireTitle: row.questionnaire_title,
            completedAt: row.completed_at,
        }));

        return NextResponse.json({
            success: true,
            data: {
                totals,
                statusBreakdown,
                assessmentsByQuestionnaire,
                recentAssessments,
            },
        });
    } catch (error) {
        console.error("Get Reports Overview Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
