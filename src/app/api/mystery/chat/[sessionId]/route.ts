// src/app/api/mystery/chat/[sessionId]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { buildMysterySystemInstruction, generateResponse, ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای ادامه گفتگو ابتدا وارد شوید.' }, { status: 401 });
    }

    const sessionUuid = params.sessionId;
    if (!sessionUuid) {
      return NextResponse.json({ success: false, message: 'شناسه جلسه نامعتبر است.' }, { status: 400 });
    }

    const { message } = await request.json();
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ success: false, message: 'متن پیام معتبر نیست.' }, { status: 400 });
    }

    const [sessionRows]: any = await db.query(
      `
        SELECT 
          ms.id,
          ms.user_id,
          ms.mystery_assessment_id,
          ms.conversation,
          ms.status,
          ma.name,
          ma.guide_name,
          ma.system_prompt
        FROM mystery_sessions ms
        JOIN mystery_assessments ma ON ma.id = ms.mystery_assessment_id
        WHERE ms.session_uuid = ?
        LIMIT 1
      `,
      [sessionUuid]
    );

    if (!Array.isArray(sessionRows) || sessionRows.length === 0) {
      return NextResponse.json({ success: false, message: 'جلسه معتبر یافت نشد.' }, { status: 404 });
    }

    const sessionData = sessionRows[0];
    if (sessionData.user_id !== session.user.userId) {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز به جلسه.' }, { status: 403 });
    }

    if (sessionData.status !== 'in-progress') {
      return NextResponse.json({ success: false, message: 'این جلسه قبلاً به پایان رسیده است.' }, { status: 400 });
    }

    const [imageRows]: any = await db.query(
      `
        SELECT title, description, ai_notes
        FROM mystery_assessment_images
        WHERE mystery_assessment_id = ?
        ORDER BY display_order ASC, id ASC
      `,
      [sessionData.mystery_assessment_id]
    );

    const systemInstruction = buildMysterySystemInstruction(sessionData.system_prompt, imageRows);

    let history: ChatMessage[] = [];
    if (sessionData.conversation) {
      try {
        const parsed = JSON.parse(sessionData.conversation);
        if (Array.isArray(parsed.history)) {
          history = parsed.history;
        }
      } catch (error) {
        console.error('Failed to parse mystery conversation JSON', error);
      }
    }

    const trimmedMessage = message.trim();
    const userMessage: ChatMessage = { role: 'user', content: trimmedMessage };
    history.push(userMessage);

    const reply = await generateResponse(systemInstruction, history);
    const assistantReply = reply || 'در حال حاضر نمی‌توانم پاسخ بدهم. لطفاً دوباره تلاش کنید.';
    const assistantMessage: ChatMessage = { role: 'assistant', content: assistantReply };
    history.push(assistantMessage);

    await db.query(
      `
        UPDATE mystery_sessions
        SET conversation = ?, updated_at = NOW()
        WHERE session_uuid = ?
      `,
      [JSON.stringify({ history }), sessionUuid]
    );

    return NextResponse.json({
      success: true,
      data: {
        reply: assistantReply,
        guideName: sessionData.guide_name,
      },
    });
  } catch (error) {
    console.error('Mystery chat error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
