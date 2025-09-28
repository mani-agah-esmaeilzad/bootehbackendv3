// src/app/api/assessment/start/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';
// import { createConversationState } from '@/lib/ai-conversations'; // <-- این خط حذف می‌شود
import { v4 as uuidv4 } from 'uuid';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        }
        const decodedToken = authenticateToken(token) as { id: number; };
        const userId = decodedToken.id;
        
        const assessmentId = parseInt(params.id, 10);
        if (isNaN(assessmentId)) {
            return NextResponse.json({ success: false, message: 'شناسه ارزیابی نامعتبر است' }, { status: 400 });
        }

        connection = await getConnectionWithRetry();
        if (!connection) {
            throw new Error('اتصال به دیتابیس برقرار نشد');
        }

        // اطلاعات پرسشنامه را مستقیماً از دیتابیس می‌خوانیم
        const [assessmentRows]: any = await connection.execute(
            'SELECT q.*, ua.status FROM questionnaires q JOIN user_assessments ua ON q.id = ua.questionnaire_id WHERE q.id = ? AND ua.user_id = ?',
            [assessmentId, userId]
        );

        if (assessmentRows.length === 0) {
            return NextResponse.json({ success: false, message: 'ارزیابی یافت نشد یا به شما تخصیص داده نشده است' }, { status: 404 });
        }
        
        const assessment = assessmentRows[0];
        
        if (assessment.status === 'completed') {
            return NextResponse.json({ success: false, message: 'این ارزیابی قبلا توسط شما تکمیل شده است' }, { status: 403 });
        }
        
        const sessionId = uuidv4();

        // نیازی به فراخوانی createConversationState نیست. 
        // تابع getConversationState در فایل chat/route.ts خودش جلسه جدید را مدیریت می‌کند.

        // اطلاعات لازم برای شروع چت را مستقیماً از آبجکت assessment برمی‌گردانیم
        return NextResponse.json({
            success: true,
            data: {
                sessionId: sessionId,
                initialMessage: assessment.welcome_message || 'سلام! به جلسه ارزیابی خوش آمدید. آماده‌اید شروع کنیم؟',
                settings: {
                    has_timer: assessment.has_timer,
                    timer_duration: assessment.timer_duration,
                },
                // نام شخصیت را مستقیماً از اینجا می‌خوانیم
                personaName: assessment.persona_name || 'مشاور',
            }
        });

    } catch (error: any) {
        console.error('Start Assessment API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}
