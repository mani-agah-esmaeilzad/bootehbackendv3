// src/app/api/assessment/finish/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConnectionWithRetry } from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import { getConversationState, ConversationHistoryMessage } from '@/lib/ai-conversations'; 
// ۴. اطمینان از import صحیح تابع
import { generateFinalReport } from '@/lib/ai-gemini';

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    let connection;
    try {
        const token = extractTokenFromHeader(req.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        }
        const decoded = authenticateToken(token) as { id: number };
        const userId = decoded.id;
        const assessmentId = parseInt(params.id, 10);

        // در این نسخه، پاسخ سوالات تکمیلی را هم از body می‌گیریم
        const { session_id: sessionId, supplementary_answers: supplementaryAnswers } = await req.json();

        if (!sessionId) {
            return NextResponse.json({ success: false, message: 'شناسه جلسه ارائه نشده است' }, { status: 400 });
        }

        connection = await getConnectionWithRetry();
        if (!connection) {
            throw new Error('اتصال به دیتابیس برقرار نشد');
        }

        const conversationState = await getConversationState(sessionId, assessmentId, connection);
        const chatHistory: ConversationHistoryMessage[] = conversationState.history;

        // فراخوانی تابع جدید برای ساخت گزارش نهایی
        const report = await generateFinalReport(chatHistory, supplementaryAnswers || [], conversationState.evaluationCriteria);

        await connection.execute(
            `INSERT INTO assessment_results (user_id, questionnaire_id, session_id, report_data, created_at) 
             VALUES (?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE report_data = ?`,
            [userId, assessmentId, sessionId, JSON.stringify(report), JSON.stringify(report)]
        );

        await connection.execute(
            `UPDATE user_assessments SET status = 'completed', completed_at = NOW() 
             WHERE user_id = ? AND questionnaire_id = ?`,
            [userId, assessmentId]
        );

        return NextResponse.json({ success: true, message: 'ارزیابی با موفقیت به پایان رسید و گزارش تولید شد.' });
    } catch (error: any) {
        console.error("Finish Assessment Error:", error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
