// src/app/api/admin/reports/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        const assessmentId = parseInt(params.id, 10);
        if (isNaN(assessmentId)) {
            return NextResponse.json({ success: false, message: 'ID گزارش نامعتبر است' }, { status: 400 });
        }

        const [rows]: any = await db.query(
            `SELECT 
                a.id, 
                a.results,
                a.completed_at,
                u.username,
                u.first_name,
                u.last_name,
                u.email,
                q.name as questionnaire_title,
                q.max_score
             FROM assessments a
             JOIN users u ON a.user_id = u.id
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.id = ?`,
            [assessmentId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'گزارش یافت نشد' }, { status: 404 });
        }

        const reportData = rows[0];
        let finalAnalysis = {}; // آبجکت پیش‌فرض

        if (reportData.results) {
            try {
                const parsedResults = JSON.parse(reportData.results);
                if (parsedResults && parsedResults.final_analysis) {
                    finalAnalysis = parsedResults.final_analysis;
                }
            } catch (e) {
                console.error("Failed to parse results JSON for assessment ID:", assessmentId);
            }
        }
        
        // *** FINAL FIX: Send the entire analysis object nested under 'analysis' key ***
        const finalData = {
            id: reportData.id,
            username: reportData.username,
            email: reportData.email,
            firstName: reportData.first_name,
            lastName: reportData.last_name,
            questionnaire_title: reportData.questionnaire_title,
            completed_at: reportData.completed_at,
            max_score: reportData.max_score || 100,
            analysis: finalAnalysis // ارسال کل آبجکت تحلیل به فرانت‌اند
        };

        return NextResponse.json({ success: true, data: finalData });

    } catch (error) {
        console.error("Get Report Detail Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
