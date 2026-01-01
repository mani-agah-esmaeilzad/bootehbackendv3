// src/app/api/admin/reports/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { requireAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const guard = await requireAdmin(request);
    if (!guard.ok) {
        return guard.response;
    }

    try {
// *** FINAL FIX: The query now filters for 'completed' status only and uses correct column names ***
        const [rows]: any = await db.query(
            `SELECT 
                a.id as assessment_id,
                a.status,
                a.completed_at,
                u.id as user_id,
                u.username,
                u.first_name,
                u.last_name,
                q.id as questionnaire_id,
                q.name as questionnaire_title
             FROM assessments a
             JOIN users u ON a.user_id = u.id
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.status = 'completed' -- Only fetch completed assessments
             ORDER BY a.completed_at DESC, a.created_at DESC`
        );

        return NextResponse.json({ success: true, data: rows });

    } catch (error) {
        console.error("Get Reports List Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}