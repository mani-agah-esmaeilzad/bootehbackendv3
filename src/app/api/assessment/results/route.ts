// src/app/api/assessment/results/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth'; // استفاده از getSession

export async function GET(request: Request) {
    try {
        // استفاده از getSession برای احراز هویت امن
        const session = await getSession();
        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 401 });
        }
        const userId = session.user.userId;

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
