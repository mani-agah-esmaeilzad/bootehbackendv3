// src/app/api/personality/start/[slug]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { getInitialAssessmentPrompt, ChatMessage } from '@/lib/ai';
import { fetchUserPromptTokens, applyUserPromptPlaceholders } from '@/lib/promptPlaceholders';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای شروع آزمون لازم است وارد شوید.' }, { status: 401 });
    }

    const slug = params.slug;
    if (!slug) {
      return NextResponse.json({ success: false, message: 'شناسه آزمون نامعتبر است.' }, { status: 400 });
    }

    const [assessmentRows]: any = await db.query(
      `SELECT id, name, persona_name, initial_prompt, persona_prompt, analysis_prompt, has_timer, timer_duration
       FROM personality_assessments
       WHERE slug = ? AND is_active = 1`,
      [slug]
    );

    if (!Array.isArray(assessmentRows) || assessmentRows.length === 0) {
      return NextResponse.json({ success: false, message: 'آزمون مورد نظر در دسترس نیست.' }, { status: 404 });
    }

    const assessment = assessmentRows[0];
    const userId = session.user.userId;
    const userTokens = await fetchUserPromptTokens(userId);

    const [existingSessions]: any = await db.query(
      `SELECT session_uuid, results, status, created_at
         FROM personality_sessions
        WHERE user_id = ? AND personality_assessment_id = ? AND status = 'in-progress'
        ORDER BY created_at DESC LIMIT 1`,
      [userId, assessment.id]
    );

    let sessionUuid: string;
    let history: ChatMessage[] = [];
    const openingTemplate = assessment.initial_prompt || getInitialAssessmentPrompt(assessment.name);
    const openingMessage = applyUserPromptPlaceholders(openingTemplate, userTokens);

    if (Array.isArray(existingSessions) && existingSessions.length > 0) {
      sessionUuid = existingSessions[0].session_uuid;
      if (existingSessions[0].results) {
        try {
          const parsed = JSON.parse(existingSessions[0].results);
          if (Array.isArray(parsed.history)) {
            history = parsed.history;
          }
        } catch (error) {
          console.error('Failed to parse personality session history', error);
        }
      }
    } else {
      sessionUuid = uuidv4();
      history = [{ role: 'assistant', content: openingMessage }];
      await db.query(
        `INSERT INTO personality_sessions (user_id, personality_assessment_id, session_uuid, status, results)
         VALUES (?, ?, ?, 'in-progress', ?)` ,
        [userId, assessment.id, sessionUuid, JSON.stringify({ history })]
      );
    }

    if (history.length === 0) {
      history.push({ role: 'assistant', content: openingMessage });
      await db.query(
        `UPDATE personality_sessions SET results = ? WHERE session_uuid = ?`,
        [JSON.stringify({ history }), sessionUuid]
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionUuid,
        personaName: assessment.persona_name,
        testName: assessment.name,
        initialMessage: openingMessage,
        history,
        settings: {
          has_timer: !!assessment.has_timer,
          timer_duration: assessment.timer_duration,
        },
      },
    });
  } catch (error) {
    console.error('Start Personality Assessment Error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
