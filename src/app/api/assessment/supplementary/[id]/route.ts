// src/app/api/assessment/supplementary/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { generateSupplementaryQuestions } from '@/lib/ai';
import { fetchUserPromptTokens, applyUserPromptPlaceholders } from '@/lib/promptPlaceholders';
import { ensurePhaseResults, getPhasePersonaPrompt } from '@/lib/questionnairePhase';

export const dynamic = 'force-dynamic';

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.userId;
        
        const questionnaireId = parseInt(params.id, 10);
        // session_id از بدنه درخواست خوانده می‌شود که توسط فرانت‌اند ارسال خواهد شد
        const { session_id: sessionId } = await req.json();

        if (isNaN(questionnaireId) || !sessionId) {
            return NextResponse.json({ success: false, message: 'اطلاعات ارسالی ناقص است' }, { status: 400 });
        }

        // واکشی تاریخچه مکالمه و پرامپت شخصیت از دیتابیس
        const [rows]: any = await db.query(
            `SELECT a.results, a.current_phase, a.phase_total, q.persona_prompt, q.phase_two_persona_prompt
             FROM assessments a
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.user_id = ? AND a.questionnaire_id = ? AND a.session_id = ?`,
            [userId, questionnaireId, sessionId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'جلسه ارزیابی یافت نشد' }, { status: 404 });
        }

        const { results: resultsString, persona_prompt, phase_two_persona_prompt, current_phase, phase_total } = rows[0];
        const phaseTotal = phase_total || 1;
        const currentPhase = current_phase || 1;
        const results = ensurePhaseResults(resultsString || null, phaseTotal);
        const phaseEntry = results.phases?.[currentPhase - 1] ?? { history: [] };
        const conversationJson = JSON.stringify(phaseEntry.history || []);
        const userTokens = await fetchUserPromptTokens(userId);
        const personaPromptRaw = getPhasePersonaPrompt(rows[0], currentPhase) || persona_prompt || '';
        const personalizedPersonaPrompt = personaPromptRaw
            ? applyUserPromptPlaceholders(personaPromptRaw, userTokens)
            : personaPromptRaw;

        // تولید سوالات تکمیلی توسط AI
        const questions = await generateSupplementaryQuestions(conversationJson, personalizedPersonaPrompt || persona_prompt || "");

        // بک‌اند باید دقیقا همان کلیدهایی را برگرداند که فرانت‌اند انتظار دارد
        return NextResponse.json({
            success: true,
            data: {
                supplementary_question_1: questions.q1,
                supplementary_question_2: questions.q2
            }
        });
    } catch (error) {
        console.error('Supplementary Questions Error:', error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
