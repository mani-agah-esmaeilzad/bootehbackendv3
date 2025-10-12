// src/app/api/assessment/finish/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { analyzeConversation } from '@/lib/ai';

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
            `SELECT a.id, a.results, q.analysis_prompt 
             FROM assessments a
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.user_id = ? AND a.questionnaire_id = ? AND a.session_id = ?`,
            [userId, questionnaireId, sessionId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'جلسه ارزیابی یافت نشد' }, { status: 404 });
        }

        const { id: assessmentId, results: resultsString, analysis_prompt } = rows[0];
        const results = resultsString ? JSON.parse(resultsString) : {};
        const conversationJson = JSON.stringify(results.history || []);

        // 1. دریافت رشته JSON تحلیل از AI
        const analysisJsonString = await analyzeConversation(conversationJson, analysis_prompt);
        
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
        const updatedResults = { 
            ...results, 
            supplementary_answers: supplementary_answers,
            // حالا آبجکت parse شده را ذخیره می‌کنیم، نه رشته اولیه را
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
                analysis: finalAnalysisObject, // آبجکت تحلیل را برمی‌گردانیم
                assessmentId: assessmentId
            }
        });
    } catch (error) {
        console.error('Finish Assessment Error:', error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
