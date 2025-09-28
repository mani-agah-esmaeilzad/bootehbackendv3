// src/app/api/admin/questionnaires/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';
import { z } from 'zod';

// ... (schema and POST function remain the same as before)
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


export async function POST(request: NextRequest) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        
        const decodedToken = authenticateToken(token) as { id: number; role: string; };
        if (decodedToken.role !== 'admin') return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });

        const body = await request.json();

        const validationResult = questionnaireSchema.safeParse(body);
        if (!validationResult.success) {
            console.error("Validation Error:", validationResult.error.errors);
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
        if (!connection) throw new Error('اتصال به دیتابیس برقرار نشد');
        
        const [result] = await connection.execute(
            `INSERT INTO questionnaires (name, welcome_message, persona_name, persona_prompt, analysis_prompt, has_timer, timer_duration, secondary_persona_name, secondary_persona_prompt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                welcome_message,
                persona_name,
                persona_prompt,
                analysis_prompt,
                has_timer,
                has_timer ? timer_duration : null,
                secondary_persona_name,
                secondary_persona_prompt
            ]
        );
        
        return NextResponse.json({ success: true, data: { id: (result as any).insertId } });

    } catch (error: any) {
        console.error('Create Questionnaire API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}


export async function GET(request: NextRequest) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        }
        authenticateToken(token);

        connection = await getConnectionWithRetry();
        // ✅ مرتب‌سازی بر اساس display_order
        const [rows] = await connection.execute('SELECT id, name FROM questionnaires ORDER BY display_order ASC');

        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error("Error fetching questionnaires:", error.message);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}
