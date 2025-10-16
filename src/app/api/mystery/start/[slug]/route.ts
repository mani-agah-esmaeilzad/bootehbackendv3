// src/app/api/mystery/start/[slug]/route.ts

import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import db, { getConnectionWithRetry } from '@/lib/database';
import { getSession } from '@/lib/auth';
import { buildMysterySystemInstruction, ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  let connection: any;
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای شروع آزمون ابتدا وارد شوید.' }, { status: 401 });
    }

    const slug = params.slug;
    if (!slug) {
      return NextResponse.json({ success: false, message: 'شناسه آزمون نامعتبر است.' }, { status: 400 });
    }

    const [assessmentRows]: any = await db.query(
      `
        SELECT id, name, intro_message, guide_name, system_prompt, analysis_prompt, is_active
        FROM mystery_assessments
        WHERE slug = ?
        LIMIT 1
      `,
      [slug]
    );

    if (!Array.isArray(assessmentRows) || assessmentRows.length === 0) {
      return NextResponse.json({ success: false, message: 'آزمون مورد نظر یافت نشد.' }, { status: 404 });
    }

    const assessment = assessmentRows[0];
    if (!assessment.is_active) {
      return NextResponse.json({ success: false, message: 'این آزمون در حال حاضر غیرفعال است.' }, { status: 403 });
    }

    const [imageRows]: any = await db.query(
      `
        SELECT title, description, ai_notes
        FROM mystery_assessment_images
        WHERE mystery_assessment_id = ?
        ORDER BY display_order ASC, id ASC
      `,
      [assessment.id]
    );

    const systemInstruction = buildMysterySystemInstruction(assessment.system_prompt, imageRows);

    const userId = session.user.userId;

    const [existingSessions]: any = await db.query(
      `
        SELECT session_uuid, conversation, status
        FROM mystery_sessions
        WHERE user_id = ? AND mystery_assessment_id = ? AND status = 'in-progress'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId, assessment.id]
    );

    let sessionUuid: string;
    let history: ChatMessage[] = [];
    const introMessage: ChatMessage = { role: 'assistant', content: assessment.intro_message };

    if (Array.isArray(existingSessions) && existingSessions.length > 0) {
      sessionUuid = existingSessions[0].session_uuid;
      if (existingSessions[0].conversation) {
        try {
          const parsed = JSON.parse(existingSessions[0].conversation);
          if (Array.isArray(parsed.history)) {
            history = parsed.history;
          }
        } catch (error) {
          console.error('Failed to parse mystery session history', error);
        }
      }
      if (history.length === 0) {
        history = [introMessage];
        await db.query(
          `UPDATE mystery_sessions SET conversation = ? WHERE session_uuid = ?`,
          [JSON.stringify({ history }), sessionUuid]
        );
      }
    } else {
      sessionUuid = uuidv4();
      history = [introMessage];
      connection = await getConnectionWithRetry();
      try {
        await connection.beginTransaction();
        await connection.query(
          `
            INSERT INTO mystery_sessions (user_id, mystery_assessment_id, session_uuid, status, conversation)
            VALUES (?, ?, ?, 'in-progress', ?)
          `,
          [userId, assessment.id, sessionUuid, JSON.stringify({ history })]
        );
        await connection.commit();
      } catch (error) {
        if (connection) await connection.rollback();
        throw error;
      } finally {
        if (connection) connection.release();
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionUuid,
        testName: assessment.name,
        guideName: assessment.guide_name,
        introMessage: assessment.intro_message,
        history,
        systemInstruction,
      },
    });
  } catch (error) {
    console.error('Start Mystery Assessment Error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
