// src/app/api/personality/finish/[sessionId]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { analyzeConversation } from '@/lib/ai';
import { fetchUserPromptTokens, applyUserPromptPlaceholders } from '@/lib/promptPlaceholders';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای پایان آزمون باید وارد شوید.' }, { status: 401 });
    }

    const sessionUuid = params.sessionId;
    if (!sessionUuid) {
      return NextResponse.json({ success: false, message: 'شناسه جلسه نامعتبر است.' }, { status: 400 });
    }

    const [rows]: any = await db.query(
      `SELECT ps.id, ps.user_id, ps.results, ps.status, pa.analysis_prompt, pa.name
         FROM personality_sessions ps
         JOIN personality_assessments pa ON ps.personality_assessment_id = pa.id
        WHERE ps.session_uuid = ?`,
      [sessionUuid]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, message: 'جلسه‌ای برای این شناسه یافت نشد.' }, { status: 404 });
    }

    const record = rows[0];
    if (record.user_id !== session.user.userId) {
      return NextResponse.json({ success: false, message: 'به این جلسه دسترسی ندارید.' }, { status: 403 });
    }

    let history: any[] = [];
    if (record.results) {
      try {
        const parsed = JSON.parse(record.results);
        if (Array.isArray(parsed.history)) {
          history = parsed.history;
        }
      } catch (error) {
        console.error('Failed to parse session history before analysis', error);
      }
    }

    const conversationJson = JSON.stringify(history);
    const userTokens = await fetchUserPromptTokens(session.user.userId);
    const analysisPrompt = record.analysis_prompt
      ? applyUserPromptPlaceholders(record.analysis_prompt, userTokens)
      : record.analysis_prompt;
    const analysisString = await analyzeConversation(conversationJson, analysisPrompt || record.analysis_prompt || '');

    let analysisObject: any = {};
    try {
      analysisObject = JSON.parse(analysisString);
    } catch (error) {
      console.error('Failed to parse personality analysis JSON', analysisString);
      analysisObject = {
        summary: `تحلیل آزمون ${record.name} به دلیل خطای پردازش در دسترس نیست.`,
        error: analysisString,
      };
    }

    const updatedResults = {
      history,
      analysis: analysisObject,
    };

    await db.query(
      `UPDATE personality_sessions
          SET status = 'completed', results = ?, updated_at = NOW()
        WHERE session_uuid = ?`,
      [JSON.stringify(updatedResults), sessionUuid]
    );

    return NextResponse.json({
      success: true,
      message: 'آزمون با موفقیت به پایان رسید.',
      data: analysisObject,
    });
  } catch (error) {
    console.error('Finish personality assessment error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
