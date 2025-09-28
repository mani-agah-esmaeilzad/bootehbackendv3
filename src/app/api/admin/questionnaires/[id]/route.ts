// src/app/api/admin/questionnaires/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';
import { z } from 'zod';

// ✅ Use the same robust schema for editing
const questionnaireSchema = z.object({
    name: z.string().min(3),
    welcome_message: z.string().min(10),
    persona_name: z.string().min(2),
    persona_prompt: z.string().min(20),
    analysis_prompt: z.string().min(20),
    has_timer: z.boolean(),
    timer_duration: z.number().optional().nullable(),
    secondary_persona_name: z.string().optional().nullable(),
    secondary_persona_prompt: z.string().optional().nullable(),
}).refine(data => {
    if (data.has_timer) {
        return typeof data.timer_duration === 'number' && data.timer_duration > 0;
    }
    return true;
}, {
    message: "Timer duration is required when the timer is enabled.",
    path: ["timer_duration"],
});


export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        authenticateToken(token);

        const { id } = params;
        connection = await getConnectionWithRetry();
        const [rows] = await connection.execute('SELECT * FROM questionnaires WHERE id = ?', [id]);
        const questionnaire = (rows as any[])[0];

        if (!questionnaire) {
            return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: questionnaire });
    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}


export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        
        const decodedToken = authenticateToken(token) as { id: number; role: string; };
        if (decodedToken.role !== 'admin') return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });

        const { id } = params;
        const body = await request.json();

        // ✅ Validate the request body
        const validationResult = questionnaireSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ success: false, message: "داده‌های ورودی نامعتبر است", errors: validationResult.error.errors }, { status: 400 });
        }
        
        const {
            name,
            welcome_message,
            persona_name,
            persona_prompt,
            analysis_prompt,
            has_timer,
            timer_duration,
            secondary_persona_name,
            secondary_persona_prompt
        } = validationResult.data;

        connection = await getConnectionWithRetry();
        
        await connection.execute(
            `UPDATE questionnaires SET
                name = ?, welcome_message = ?, persona_name = ?, persona_prompt = ?, analysis_prompt = ?,
                has_timer = ?, timer_duration = ?, secondary_persona_name = ?, secondary_persona_prompt = ?
             WHERE id = ?`,
            [
                name, welcome_message, persona_name, persona_prompt, analysis_prompt,
                has_timer, has_timer ? timer_duration : null, secondary_persona_name, secondary_persona_prompt,
                id
            ]
        );
        
        return NextResponse.json({ success: true, message: "پرسشنامه با موفقیت به‌روزرسانی شد." });

    } catch (error: any) {
        console.error('Update Questionnaire API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}
