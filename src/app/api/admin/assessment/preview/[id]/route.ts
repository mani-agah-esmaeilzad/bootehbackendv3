// src/app/api/admin/assessment/preview/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import { getInitialAssessmentPrompt } from '@/lib/ai';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const token = extractTokenFromHeader(request.headers.get('Authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        
        const decodedToken = authenticateToken(token);
        
        // *** FIX APPLIED HERE ***
        // We now check if the token is null OR if the role is not 'admin'.
        if (!decodedToken || decodedToken.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });
        }

        const questionnaireId = parseInt(params.id, 10);
        if (isNaN(questionnaireId)) {
            return NextResponse.json({ success: false, message: 'ID پرسشنامه نامعتبر است' }, { status: 400 });
        }

        const [rows]: any = await db.query(
            "SELECT id, title, settings, persona_name FROM questionnaires WHERE id = ?",
            [questionnaireId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
        }

        const questionnaire = rows[0];
        const initialMessage = getInitialAssessmentPrompt(questionnaire.title);

        return NextResponse.json({
            success: true,
            data: {
                initialMessage,
                settings: questionnaire.settings,
                personaName: questionnaire.persona_name,
                title: questionnaire.title
            }
        });

    } catch (error) {
        console.error("Get Assessment Preview Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
