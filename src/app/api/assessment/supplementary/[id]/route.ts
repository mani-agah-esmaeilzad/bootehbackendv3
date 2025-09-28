// src/app/api/assessment/supplementary/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConnectionWithRetry } from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
// اصلاح import: استفاده از ConversationHistoryMessage به جای ChatHistory
import { getConversationState, ConversationHistoryMessage } from '@/lib/ai-conversations';
import { generateSupplementaryQuestions } from '@/lib/ai-gemini';

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
        authenticateToken(token);

        const assessmentId = parseInt(params.id, 10);
        const { session_id: sessionId } = await req.json();

        if (!sessionId) {
            return NextResponse.json({ success: false, message: 'شناسه جلسه ارائه نشده است' }, { status: 400 });
        }
        
        connection = await getConnectionWithRetry();
        if (!connection) {
            throw new Error('اتصال به دیتابیس برقرار نشد');
        }

        const conversationState = await getConversationState(sessionId, assessmentId, connection);
        const chatHistory: ConversationHistoryMessage[] = conversationState.history;

        const questions = await generateSupplementaryQuestions(chatHistory, conversationState.evaluationCriteria);

        return NextResponse.json({ success: true, data: questions });

    } catch (error: any) {
        console.error("Supplementary Questions Error:", error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
