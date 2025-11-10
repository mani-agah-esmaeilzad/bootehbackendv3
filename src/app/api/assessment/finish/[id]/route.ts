// src/app/api/assessment/finish/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { analyzeConversation, getInitialAssessmentPrompt } from '@/lib/ai';
import { fetchUserPromptTokens, applyUserPromptPlaceholders } from '@/lib/promptPlaceholders';
import { ensurePhaseResults, flattenPhaseHistory, getPhaseAnalysisPrompt, getPhaseCount, getPhasePersonaName, getPhaseWelcomeMessage } from '@/lib/questionnairePhase';
import { v4 as uuidv4 } from 'uuid';

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
        const { session_id: sessionId, supplementary_answers } = await req.json();

        if (isNaN(questionnaireId) || !sessionId) {
            return NextResponse.json({ success: false, message: 'اطلاعات ارسالی ناقص است' }, { status: 400 });
        }

        const [rows]: any = await db.query(
            `SELECT a.id, a.results, a.current_phase, a.phase_total,
                    q.analysis_prompt, q.persona_name, q.persona_prompt,
                    q.phase_two_persona_name, q.phase_two_persona_prompt,
                    q.phase_two_analysis_prompt, q.phase_two_welcome_message,
                    q.welcome_message, q.name as questionnaire_title
             FROM assessments a
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.user_id = ? AND a.questionnaire_id = ? AND a.session_id = ?`,
            [userId, questionnaireId, sessionId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'جلسه ارزیابی یافت نشد' }, { status: 404 });
        }

        const questionnaireRow = rows[0];
        const { id: assessmentId, results: resultsString, analysis_prompt, current_phase, phase_total } = questionnaireRow;
        const userTokens = await fetchUserPromptTokens(userId);
        const totalPhases = phase_total || getPhaseCount(questionnaireRow);
        const currentPhase = current_phase || 1;
        const results = ensurePhaseResults(resultsString || null, totalPhases);
        const phaseEntry = results.phases?.[currentPhase - 1];
        if (phaseEntry) {
            phaseEntry.supplementary_answers = supplementary_answers;
            results.phases![currentPhase - 1] = phaseEntry;
        }

        if (currentPhase < totalPhases) {
            const nextPhaseIndex = currentPhase + 1;
            results.currentPhase = nextPhaseIndex;
            const newSessionId = uuidv4();
            const nextInitialTemplate = getPhaseWelcomeMessage(questionnaireRow, nextPhaseIndex)
                || getInitialAssessmentPrompt(questionnaireRow.questionnaire_title || 'مرحله بعد');
            const nextInitialMessage = applyUserPromptPlaceholders(nextInitialTemplate, userTokens);

            await db.query(
                `UPDATE assessments SET results = ?, current_phase = ?, session_id = ?, updated_at = NOW()
                 WHERE id = ?`,
                [JSON.stringify(results), nextPhaseIndex, newSessionId, assessmentId]
            );

            return NextResponse.json({
                success: true,
                data: {
                    nextPhase: {
                        index: nextPhaseIndex,
                        total: totalPhases,
                        sessionId: newSessionId,
                        personaName: getPhasePersonaName(questionnaireRow, nextPhaseIndex) || questionnaireRow.persona_name,
                        initialMessage: nextInitialMessage,
                    },
                },
            });
        }

        const conversationJson = JSON.stringify(flattenPhaseHistory(results));
        const finalAnalysisPromptRaw = getPhaseAnalysisPrompt(questionnaireRow, currentPhase) || analysis_prompt;

        // 1. دریافت رشته JSON تحلیل از AI
        const personalizedAnalysisPrompt = finalAnalysisPromptRaw
            ? applyUserPromptPlaceholders(finalAnalysisPromptRaw, userTokens)
            : finalAnalysisPromptRaw;
        const analysisJsonString = await analyzeConversation(conversationJson, personalizedAnalysisPrompt || finalAnalysisPromptRaw || '');
        
        // *** FINAL FIX APPLIED HERE: Parse the analysis string into a real object ***
        let finalAnalysisObject = {};
        try {
            finalAnalysisObject = JSON.parse(analysisJsonString);
        } catch(e) {
            console.error("Failed to parse final analysis from AI:", analysisJsonString);
            // در صورت بروز خطا، یک آبجکت خطا ایجاد می‌کنیم
            finalAnalysisObject = {
                score: 0,
                report: "خطا در پردازش گزارش نهایی. پاسخ دریافتی از سرویس تحلیل معتبر نبود.",
                factor_scores: []
            };
        }

        // 2. ساخت آبجکت نهایی با داده‌های صحیح
        const aggregatedSupplementary = Array.isArray(results.phases)
            ? results.phases.reduce((acc, phase) => {
                acc[`phase_${phase.phase}`] = phase.supplementary_answers || {};
                return acc;
            }, {} as Record<string, any>)
            : { phase_1: supplementary_answers };

        const updatedResults = { 
            ...results, 
            supplementary_answers: aggregatedSupplementary,
            final_analysis: finalAnalysisObject 
        };

        // 3. ذخیره آبجکت نهایی در دیتابیس
        await db.query(
            "UPDATE assessments SET status = 'completed', results = ?, completed_at = NOW() WHERE id = ?",
            [JSON.stringify(updatedResults), assessmentId]
        );

        return NextResponse.json({
            success: true,
            message: 'ارزیابی با موفقیت به پایان رسید و تحلیل شد.',
            data: { 
                analysis: finalAnalysisObject,
                assessmentId: assessmentId
            }
        });
    } catch (error) {
        console.error('Finish Assessment Error:', error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
