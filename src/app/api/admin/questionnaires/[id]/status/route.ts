// src/app/api/admin/questionnaires/[id]/status/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const statusSchema = z.object({
    is_active: z.boolean(),
});

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز. شما ادمین نیستید.' }, { status: 403 });
        }

        const body = await request.json();
        const validation = statusSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ success: false, message: validation.error.errors[0].message }, { status: 400 });
        }

        const questionnaireId = parseInt(params.id, 10);
        if (Number.isNaN(questionnaireId)) {
            return NextResponse.json({ success: false, message: 'شناسه پرسشنامه نامعتبر است' }, { status: 400 });
        }

        const [result]: any = await db.query(
            'UPDATE questionnaires SET is_active = ? WHERE id = ?',
            [validation.data.is_active ? 1 : 0, questionnaireId]
        );

        if (result.affectedRows === 0) {
            return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'وضعیت پرسشنامه بروزرسانی شد' });
    } catch (error) {
        console.error('Update Questionnaire Status Error:', error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}
