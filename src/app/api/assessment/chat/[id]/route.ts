// src/app/api/assessment/chat/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { generateResponse } from '@/lib/ai';
import type { ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده یا نامعتبر است' }, { status: 401 });
        }
        
        const questionnaireId = parseInt(params.id, 10);
        const { message: userMessage, session_id: sessionId } = await request.json();

        if (isNaN(questionnaireId) || !userMessage || !sessionId) {
            return NextResponse.json({ success: false, message: 'اطلاعات ارسالی ناقص است' }, { status: 400 });
        }

        console.log('--- ASSESSMENT CHAT REQUEST ---', {
            questionnaireId,
            sessionId,
            userId: session.user.userId,
            userMessage
        });

        const [assessmentRows]: any = await db.query(
            `SELECT 
                q.persona_prompt, q.persona_name, q.secondary_persona_prompt,
                q.secondary_persona_name, q.character_count, a.results, a.user_id 
             FROM assessments a JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.questionnaire_id = ? AND a.session_id = ?`,
            [questionnaireId, sessionId]
        );

        if (assessmentRows.length === 0 || assessmentRows[0].user_id !== session.user.userId) {
            return NextResponse.json({ success: false, message: 'جلسه ارزیابی یافت نشد یا متعلق به شما نیست' }, { status: 404 });
        }
        
        const { 
            persona_prompt, persona_name, secondary_persona_prompt,
            secondary_persona_name, character_count, results: resultsString 
        } = assessmentRows[0];
        
        const results = resultsString ? JSON.parse(resultsString) : { history: [] };
        const history: ChatMessage[] = results.history || [];
        const updatedHistory: ChatMessage[] = [...history, { role: 'user', content: userMessage }];
        
        let finalAiResponse: string | null = null;
        let finalPersonaName: string = persona_name;

        // --- *** FINAL FIX: Implementing the new 2-step CLASSIFICATION logic *** ---

        let needsIntervention = false;

        // مرحله ۱: آیا شخصیت دوم (مبصر) فعال است؟
        if (character_count === 2 && secondary_persona_prompt) {
            // مرحله ۲: از مبصر بخواه که پاسخ را به 'VALID' یا 'INVALID' طبقه‌بندی کند
            const classificationResponse = await generateResponse(secondary_persona_prompt, updatedHistory);
            
            console.log("--- SUPERVISOR CLASSIFICATION --- :", classificationResponse?.trim().toUpperCase());

            if (classificationResponse?.trim().toUpperCase() === 'INVALID') {
                needsIntervention = true;
            }
        }

        // مرحله ۳: بر اساس طبقه‌بندی، اقدام کن
        if (needsIntervention) {
            // اگر پاسخ نامعتبر بود، یک پیام مداخله تولید کن
            const interventionPrompt = `The user has provided an invalid or off-topic response. Generate a short, firm, and guiding message in Persian to get the user back on track.`;
            // برای تولید پیام مداخله، می‌توانیم از پرامپت شخصیت اصلی یا دوم استفاده کنیم
            // اینجا از پرامپت اصلی استفاده می‌کنیم تا لحن یکپارچه بماند، اما با وظیفه‌ای متفاوت
            finalAiResponse = await generateResponse(interventionPrompt, updatedHistory);
            finalPersonaName = secondary_persona_name || persona_name; // نام مبصر را نمایش بده
        } else {
            // اگر پاسخ معتبر بود، از مشاور اصلی پاسخ عادی را بگیر
            finalAiResponse = await generateResponse(persona_prompt, updatedHistory);
            finalPersonaName = persona_name;
        }

        // --- *** End of new logic *** ---

        if (!finalAiResponse) {
            return NextResponse.json({ success: false, message: 'پاسخی از سرویس هوش مصنوعی دریافت نشد' }, { status: 500 });
        }

        console.log('--- ASSESSMENT CHAT RESPONSE ---', {
            sessionId,
            personaName: finalPersonaName,
            replyPreview: finalAiResponse.slice(0, 120).trim()
        });

        updatedHistory.push({ role: 'assistant', content: finalAiResponse });

        await db.query(
            "UPDATE assessments SET results = ? WHERE session_id = ?",
            [JSON.stringify({ ...results, history: updatedHistory }), sessionId]
        );

        return NextResponse.json({ 
            success: true, 
            data: { 
                reply: finalAiResponse,
                personaName: finalPersonaName 
            } 
        });

    } catch (error) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
