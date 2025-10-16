// src/app/api/mystery/finish/[sessionId]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { analyzeConversation } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای مشاهده گزارش ابتدا وارد شوید.' }, { status: 401 });
    }

    const sessionUuid = params.sessionId;
    if (!sessionUuid) {
      return NextResponse.json({ success: false, message: 'شناسه جلسه نامعتبر است.' }, { status: 400 });
    }

    const [sessionRows]: any = await db.query(
      `
        SELECT 
          ms.id,
          ms.user_id,
          ms.mystery_assessment_id,
          ms.conversation,
          ms.status,
          ms.summary,
          ma.analysis_prompt,
          ma.name
        FROM mystery_sessions ms
        JOIN mystery_assessments ma ON ma.id = ms.mystery_assessment_id
        WHERE ms.session_uuid = ?
        LIMIT 1
      `,
      [sessionUuid]
    );

    if (!Array.isArray(sessionRows) || sessionRows.length === 0) {
      return NextResponse.json({ success: false, message: 'جلسه یافت نشد.' }, { status: 404 });
    }

    const sessionData = sessionRows[0];
    if (sessionData.user_id !== session.user.userId) {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز.' }, { status: 403 });
    }

    if (sessionData.status === 'completed' && sessionData.conversation) {
      let parsedSummary: any = { message: 'این آزمون قبلاً به پایان رسیده است.' };
      if (sessionData.summary) {
        try {
          parsedSummary = JSON.parse(sessionData.summary);
        } catch (error) {
          console.error('Unable to parse stored mystery summary JSON', error);
        }
      }
      return NextResponse.json({
        success: true,
        data: parsedSummary,
      });
    }

    if (!sessionData.conversation) {
      return NextResponse.json({ success: false, message: 'اطلاعات گفتگو یافت نشد.' }, { status: 400 });
    }

    let conversationJson = sessionData.conversation;
    let parsedHistory: any;
    try {
      parsedHistory = JSON.parse(conversationJson);
    } catch (error) {
      console.error('Failed to parse mystery conversation while finishing', error);
      return NextResponse.json({ success: false, message: 'امکان تحلیل مکالمه وجود ندارد.' }, { status: 500 });
    }

    const analysisPrompt =
      sessionData.analysis_prompt ||
      `لطفاً بر اساس مکالمه انجام شده درباره تصاویر، یک جمع‌بندی سه‌بخشی شامل «برداشت کلی»، «نقاط قوت مشاهده شده در تحلیل تصاویر» و «پیشنهادهایی برای تعمیق نگاه تحلیلی» به زبان فارسی تهیه کن. نتیجه را در قالب یک آبجکت JSON با کلیدهای summary, strengths, recommendations بازگردان.`;

    const cleanAnalysisJson = await analyzeConversation(JSON.stringify(parsedHistory), analysisPrompt);
    let analysisObject: any = {};
    try {
      analysisObject = JSON.parse(cleanAnalysisJson);
    } catch (error) {
      console.error('Parsed analysis is not valid JSON:', cleanAnalysisJson);
      analysisObject = { summary: 'تحلیل در دسترس نیست.' };
    }

    await db.query(
      `
        UPDATE mystery_sessions
        SET status = 'completed', summary = ?, updated_at = NOW()
        WHERE session_uuid = ?
      `,
      [JSON.stringify(analysisObject), sessionUuid]
    );

    return NextResponse.json({
      success: true,
      data: analysisObject,
    });
  } catch (error) {
    console.error('Mystery finish error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
