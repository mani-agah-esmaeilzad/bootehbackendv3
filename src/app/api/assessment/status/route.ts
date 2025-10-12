// src/app/api/assessment/status/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.userId;

        // *** FINAL FIX: Using correct column names from your schema ***
        const [rows] = await db.query(
            `SELECT 
                q.id, 
                q.name as title, 
                q.description,
                COALESCE(a.status, 'pending') as status,
                q.display_order
             FROM questionnaires q
             LEFT JOIN (
                SELECT * FROM assessments WHERE user_id = ?
             ) as a ON q.id = a.questionnaire_id -- Corrected join column
             WHERE q.has_narrator = 0 -- Assuming this means the questionnaire is active
             ORDER BY q.display_order ASC, q.id ASC`,
            [userId]
        );
        
        const assessments = rows as any[];
        let currentFound = false;
        const processedAssessments = assessments.map(a => {
            if (!currentFound && a.status === 'pending') {
                a.status = 'current';
                currentFound = true;
            } else if (currentFound && a.status === 'pending') {
                a.status = 'locked';
            }
            return a;
        });

        return NextResponse.json({ success: true, data: processedAssessments });

    } catch (error) {
        console.error("Get Assessment Status Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
