// src/app/api/assessment/chat/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession, authenticateToken } from '@/lib/auth';
import { generateResponse } from '@/lib/ai';
import type { ChatMessage } from '@/lib/ai';
import { fetchUserPromptTokens, applyUserPromptPlaceholders } from '@/lib/promptPlaceholders';
import { ensurePhaseResults, getPhasePersonaName, getPhasePersonaPrompt, getPhaseCount } from '@/lib/questionnairePhase';

export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        let session = await getSession();
        if (!session.user?.userId) {
            const authHeader = request.headers.get('authorization');
            const bearerToken = authHeader && authHeader.startsWith('Bearer ')
                ? authHeader.substring(7)
                : null;

            if (bearerToken) {
                const decoded = authenticateToken(bearerToken);
                if (decoded) {
                    console.log('Auth Debug - using Authorization header for user:', decoded.userId);
                    session = {
                        user: {
                            userId: decoded.userId,
                            username: decoded.username,
                            role: decoded.role,
                            organizationId: decoded.organizationId,
                        },
                    };
                } else {
                    console.log('Auth Debug - Authorization header token invalid');
                }
            }
        }

        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده یا نامعتبر است' }, { status: 401 });
        }

        const questionnaireId = parseInt(params.id, 10);
        const { message: rawMessage, session_id: sessionId, autoStart } = await request.json();
        const isAutoStart = Boolean(autoStart);
        const userMessage: string = typeof rawMessage === 'string' ? rawMessage : '';

        if (isNaN(questionnaireId) || !sessionId || (!isAutoStart && (!userMessage || userMessage.trim().length === 0))) {
            return NextResponse.json({ success: false, message: 'اطلاعات ارسالی ناقص است' }, { status: 400 });
        }

        console.log('--- ASSESSMENT CHAT REQUEST ---', {
            questionnaireId,
            sessionId,
            userId: session.user.userId,
            userMessage,
            autoStart: isAutoStart
        });

        const [assessmentRows]: any = await db.query(
            `SELECT 
                q.persona_prompt, q.persona_name, q.secondary_persona_prompt,
                q.secondary_persona_name, q.character_count, q.next_mystery_slug,
                q.phase_two_persona_prompt, q.phase_two_persona_name,
                a.results, a.user_id, a.current_phase, a.phase_total
             FROM assessments a JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.questionnaire_id = ? AND a.session_id = ?`,
            [questionnaireId, sessionId]
        );

        if (assessmentRows.length === 0 || assessmentRows[0].user_id !== session.user.userId) {
            return NextResponse.json({ success: false, message: 'جلسه ارزیابی یافت نشد یا متعلق به شما نیست' }, { status: 404 });
        }

        const {
            persona_prompt, persona_name, secondary_persona_prompt,
            secondary_persona_name, character_count, next_mystery_slug,
            phase_two_persona_prompt, phase_two_persona_name,
            results: resultsString, current_phase, phase_total
        } = assessmentRows[0];

        const phaseTotal = phase_total || getPhaseCount(assessmentRows[0]);
        const currentPhase = current_phase || 1;

        const userTokens = await fetchUserPromptTokens(session.user.userId);
        const personaPromptRaw = getPhasePersonaPrompt(assessmentRows[0], currentPhase) || persona_prompt || '';
        const personaNameForPhase = getPhasePersonaName(assessmentRows[0], currentPhase) || persona_name;

        const primaryPersonaPrompt = personaPromptRaw
            ? applyUserPromptPlaceholders(personaPromptRaw, userTokens)
            : personaPromptRaw;
        const secondaryPersona = secondary_persona_prompt
            ? applyUserPromptPlaceholders(secondary_persona_prompt, userTokens)
            : secondary_persona_prompt;

        const results = ensurePhaseResults(resultsString || null, phaseTotal);
        const phaseIndex = Math.max(1, Math.min(currentPhase, results.phases?.length || 1)) - 1;
        const phaseEntry = results.phases![phaseIndex];
        const history: ChatMessage[] = Array.isArray(phaseEntry.history) ? phaseEntry.history : [];
        const updatedHistory: ChatMessage[] = [...history];
        const historyForModel: ChatMessage[] = [...history];

        const nextStage = next_mystery_slug
            ? { type: 'mystery', slug: next_mystery_slug }
            : null;

        if (isAutoStart) {
            historyForModel.push({
                role: 'user',
                content: 'گفتگو را در نقش خود آغاز کن، کاربر را خوش‌آمد بگو، سناریوی ارزیابی را معرفی کن و از او بخواه آماده پاسخ‌گویی باشد. پاسخ را به زبان فارسی و با لحنی حرفه‌ای ارائه بده.',
            });
        } else {
            updatedHistory.push({ role: 'user', content: userMessage });
            historyForModel.push({ role: 'user', content: userMessage });
        }

        let rawAiResponse: string | null = null;
        let finalPersonaName: string = personaNameForPhase || persona_name;

        // --- *** FINAL FIX: Implementing the new 2-step CLASSIFICATION logic *** ---

        let needsIntervention = false;

        // مرحله ۱: آیا شخصیت دوم (مبصر) فعال است؟
        if (!isAutoStart && character_count === 2 && secondaryPersona) {
            // مرحله ۲: از مبصر بخواه که پاسخ را به 'VALID' یا 'INVALID' طبقه‌بندی کند
            const classificationResponse = await generateResponse(secondaryPersona, updatedHistory);

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
            rawAiResponse = await generateResponse(interventionPrompt, updatedHistory);
            finalPersonaName = secondary_persona_name || persona_name; // نام مبصر را نمایش بده
        } else if (isAutoStart) {
            rawAiResponse = await generateResponse(primaryPersonaPrompt || persona_prompt, historyForModel);
            finalPersonaName = persona_name;
        } else {
            // اگر پاسخ معتبر بود، از مشاور اصلی پاسخ عادی را بگیر
            rawAiResponse = await generateResponse(primaryPersonaPrompt || persona_prompt, historyForModel);
            finalPersonaName = persona_name;
        }

        // --- *** End of new logic *** ---

        if (!rawAiResponse) {
            return NextResponse.json({ success: false, message: 'پاسخی از سرویس هوش مصنوعی دریافت نشد' }, { status: 500 });
        }

        const COMPLETION_TOKENS = ['__CONVERSATION_END__', '[END_ASSESSMENT]'];
        const normalizedResponse = rawAiResponse.replace(/\s+/g, '').toUpperCase();
        const matchedToken = COMPLETION_TOKENS.find(token => normalizedResponse.includes(token.replace(/\s+/g, '').toUpperCase()));
        const cleanedAiResponse = matchedToken
            ? rawAiResponse.split(matchedToken).join('').trim()
            : rawAiResponse.trim();
        const isConversationComplete = Boolean(matchedToken);
        console.log('CONVERSATION COMPLETE?', isConversationComplete);

        console.log('--- ASSESSMENT CHAT RESPONSE ---', {
            sessionId,
            personaName: finalPersonaName,
            replyPreview: cleanedAiResponse.slice(0, 120)
        });

        updatedHistory.push({ role: 'assistant', content: cleanedAiResponse });

        phaseEntry.history = updatedHistory;
        results.phases![phaseIndex] = phaseEntry;
        if (phaseIndex === 0) {
            results.history = updatedHistory;
        }

        await db.query(
            "UPDATE assessments SET results = ? WHERE session_id = ?",
            [JSON.stringify(results), sessionId]
        );

        return NextResponse.json({
            success: true,
            data: {
                reply: cleanedAiResponse,
                personaName: finalPersonaName,
                isComplete: isConversationComplete,
                completionToken: matchedToken || null,
                nextStage,
            }
        });

    } catch (error) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
