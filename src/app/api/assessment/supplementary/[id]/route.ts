// src/app/api/assessment/supplementary/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { generateSupplementaryQuestions } from '@/lib/ai';

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
            `SELECT a.results, q.persona_prompt
             FROM assessments a
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.user_id = ? AND a.questionnaire_id = ? AND a.session_id = ?`,
            [userId, questionnaireId, sessionId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'جلسه ارزیابی یافت نشد' }, { status: 404 });
        }

        const { results: resultsString, persona_prompt } = rows[0];
        const results = resultsString ? JSON.parse(resultsString) : {};
        const conversationJson = JSON.stringify(results.history || []);

        // تولید سوالات تکمیلی توسط AI
        const questions = await generateSupplementaryQuestions(conversationJson, persona_prompt);

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
