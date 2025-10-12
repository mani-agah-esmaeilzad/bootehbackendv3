// src/app/api/admin/assessment/preview-chat/route.ts

import { NextResponse } from 'next/server';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import { generateResponse } from '@/lib/ai';
import db from '@/lib/database';
import type { ChatMessage } from '@/lib/ai';

interface PreviewChatRequest {
    message: string;
    history: ChatMessage[];
    questionnaireId: number;
}

export async function POST(request: Request) {
    try {
        const token = extractTokenFromHeader(request.headers.get('Authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن احراز هویت ارسال نشده است' }, { status: 401 });
        }

        const decodedToken = authenticateToken(token);
        
        // *** FIX APPLIED HERE ***
        // We now check if the token is null OR if the role is not 'admin'.
        if (!decodedToken || decodedToken.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });
        }

        const body: PreviewChatRequest = await request.json();
        const { message, history, questionnaireId } = body;

        const [rows]: any = await db.query(
            "SELECT persona_prompt FROM questionnaires WHERE id = ?",
            [questionnaireId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
        }
        const personaPrompt = rows[0].persona_prompt;

        const updatedHistory: ChatMessage[] = [...history, { role: 'user', content: message }];

        const aiResponse = await generateResponse(personaPrompt, updatedHistory);

        if (!aiResponse) {
            return NextResponse.json({ success: false, message: 'پاسخی از سرویس هوش مصنوعی دریافت نشد' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: {
                reply: aiResponse
            }
        });

    } catch (error) {
        console.error("Preview Chat API Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
