// src/app/api/assessment/results/[id]/route.ts

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
        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 401 });
        }
        const userId = session.user.userId;
        
        // This ID is now the correct assessment ID from the 'assessments' table
        const assessmentId = parseInt(params.id, 10);
        if (isNaN(assessmentId)) {
            return NextResponse.json({ success: false, message: 'ID نامعتبر است' }, { status: 400 });
        }

        // *** FINAL FIX: The query is now robust and fetches all needed data ***
        const [rows]: any = await db.query(
            `SELECT 
                a.id, 
                a.status,
                a.results,
                a.completed_at,
                q.id as questionnaire_id,
                q.name as questionnaire_title
             FROM assessments a
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.id = ? AND a.user_id = ?`,
            [assessmentId, userId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'نتیجه ارزیابی یافت نشد' }, { status: 404 });
        }
        
        // Parse the results from JSON string before sending
        const resultData = rows[0];
        if (resultData.results) {
            resultData.results = JSON.parse(resultData.results);
        }

        return NextResponse.json({ success: true, data: resultData });

    } catch (error) {
        console.error("Get Result Detail Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
