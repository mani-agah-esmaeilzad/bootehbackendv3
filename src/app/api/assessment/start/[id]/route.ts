// src/app/api/assessment/start/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { getInitialAssessmentPrompt } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized: User not found' }, { status: 401 });
    }
    const userId = session.user.userId;
    const questionnaireId = parseInt(params.id, 10);

    if (isNaN(questionnaireId)) {
      return NextResponse.json({ success: false, message: 'Invalid assessment ID' }, { status: 400 });
    }

    const [assessmentRows]: any = await db.query(
      `SELECT 
        q.id, 
        q.name as title, 
        JSON_OBJECT('has_timer', q.has_timer, 'timer_duration', q.timer_duration) as settings, 
        q.persona_name
       FROM questionnaires q
       LEFT JOIN assessments a ON q.id = a.questionnaire_id AND a.user_id = ?
       WHERE q.id = ? AND (a.status IS NULL OR a.status = 'pending' OR a.status = 'current')`,
      [userId, questionnaireId]
    );

    if (assessmentRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Assessment not found or already completed' }, { status: 404 });
    }

    const assessment = assessmentRows[0];
    const sessionId = uuidv4();
    const initialMessage = getInitialAssessmentPrompt(assessment.title);

    await db.query(
      `INSERT INTO assessments (user_id, questionnaire_id, status, session_id, results, updated_at)
       VALUES (?, ?, 'in-progress', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE status = 'in-progress', session_id = VALUES(session_id), updated_at = NOW()`,
      [userId, questionnaireId, sessionId, JSON.stringify({ version: '1.0', history: [] })]
    );
    
    // Improved safety for JSON parsing
    let parsedSettings = {};
    try {
        if(assessment.settings) parsedSettings = JSON.parse(assessment.settings);
    } catch(e) {
        console.error("Failed to parse settings JSON:", assessment.settings);
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        initialMessage,
        settings: parsedSettings,
        personaName: assessment.persona_name,
      },
    });

  } catch (error) {
    console.error('Error starting assessment:', error);
    return NextResponse.json({ success: false, message: 'An internal server error occurred' }, { status: 500 });
  }
}
