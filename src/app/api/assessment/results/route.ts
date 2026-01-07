// src/app/api/assessment/results/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { mockAssessmentResults } from '@/data/mockAssessment';

const ASSESSMENT_MOCK_MODE = process.env.ASSESSMENT_MOCK_MODE !== 'off';

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 401 });
        }
        const userId = session.user.userId;

        if (ASSESSMENT_MOCK_MODE) {
            return NextResponse.json({
                success: true,
                mock: true,
                data: mockAssessmentResults,
            });
        }

        // دریافت لیست نتایج ارزیابی‌های تکمیل شده برای کاربر
        const [rows] = await db.query(
            `SELECT 
                ua.id, 
                q.title, 
                ua.updated_at as completed_at
             FROM user_assessments ua
             JOIN questionnaires q ON ua.assessment_id = q.id
             WHERE ua.user_id = ? AND ua.status = 'completed'
             ORDER BY ua.updated_at DESC`,
            [userId]
        );

        return NextResponse.json({ success: true, data: rows });

    } catch (error) {
        console.error("Get Results List Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
