// src/app/api/personality/chat/[sessionId]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { generateResponse, ChatMessage } from '@/lib/ai';
import { fetchUserPromptTokens, applyUserPromptPlaceholders } from '@/lib/promptPlaceholders';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای ادامه آزمون باید وارد شوید.' }, { status: 401 });
    }

    const sessionUuid = params.sessionId;
    if (!sessionUuid) {
      return NextResponse.json({ success: false, message: 'شناسه جلسه معتبر نیست.' }, { status: 400 });
    }

    const { message } = await request.json();
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ success: false, message: 'متن پیام نامعتبر است.' }, { status: 400 });
    }

    const [rows]: any = await db.query(
      `SELECT ps.id, ps.user_id, ps.results, pa.persona_prompt, pa.persona_name, pa.model
         FROM personality_sessions ps
         JOIN personality_assessments pa ON ps.personality_assessment_id = pa.id
        WHERE ps.session_uuid = ? AND ps.status = 'in-progress'`,
      [sessionUuid]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, message: 'جلسه‌ای برای این شناسه یافت نشد.' }, { status: 404 });
    }

    const record = rows[0];
    if (record.user_id !== session.user.userId) {
      return NextResponse.json({ success: false, message: 'به این جلسه دسترسی ندارید.' }, { status: 403 });
    }

    let results: { history: ChatMessage[]; analysis?: any } = { history: [] };
    if (record.results) {
      try {
        const parsed = JSON.parse(record.results);
        results = {
          ...parsed,
          history: Array.isArray(parsed.history) ? parsed.history : [],
        };
      } catch (error) {
        console.error('Parsing personality session history failed', error);
      }
    }

    const history: ChatMessage[] = results.history || [];
    history.push({ role: 'user', content: message });

    const userTokens = await fetchUserPromptTokens(session.user.userId);
    const personaPrompt = record.persona_prompt
      ? applyUserPromptPlaceholders(record.persona_prompt, userTokens)
      : record.persona_prompt;

    const aiReply = await generateResponse(personaPrompt || record.persona_prompt, history, record.model || undefined);
    if (!aiReply) {
      return NextResponse.json({ success: false, message: 'پاسخ سیستم هوشمند در حال حاضر در دسترس نیست.' }, { status: 500 });
    }

    history.push({ role: 'assistant', content: aiReply });

    await db.query(
      `UPDATE personality_sessions SET results = ?, updated_at = NOW() WHERE session_uuid = ?`,
      [JSON.stringify({ ...results, history }), sessionUuid]
    );

    return NextResponse.json({
      success: true,
      data: {
        reply: aiReply,
        personaName: record.persona_name,
      },
    });
  } catch (error) {
    console.error('Personality chat error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
