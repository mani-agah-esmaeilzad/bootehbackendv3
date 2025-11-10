// src/app/api/assessment/start/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { getInitialAssessmentPrompt } from '@/lib/ai';
import { fetchUserPromptTokens, applyUserPromptPlaceholders } from '@/lib/promptPlaceholders';
import { getPhaseCount, getPhaseWelcomeMessage, getPhasePersonaName, ensurePhaseResults } from '@/lib/questionnairePhase';

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
        q.initial_prompt,
        q.welcome_message,
        q.persona_name,
        q.persona_prompt,
        q.phase_two_persona_name,
        q.phase_two_persona_prompt,
        q.phase_two_welcome_message,
        q.total_phases,
        q.next_mystery_slug,
        JSON_OBJECT('has_timer', q.has_timer, 'timer_duration', q.timer_duration) as settings,
        a.id as assessment_id,
        a.session_id as assessment_session_id,
        a.status as assessment_status,
        a.results as assessment_results,
        a.current_phase as assessment_current_phase,
        a.phase_total as assessment_phase_total
       FROM questionnaires q
       LEFT JOIN assessments a ON q.id = a.questionnaire_id AND a.user_id = ?
       WHERE q.id = ? AND (a.status IS NULL OR a.status = 'pending' OR a.status = 'in-progress')`,
      [userId, questionnaireId]
    );

    if (assessmentRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Assessment not found or already completed' }, { status: 404 });
    }

    const assessment = assessmentRows[0];
    const derivedPhaseTotal = Math.max(getPhaseCount(assessment), 1);
    const storedPhaseTotal = assessment.assessment_phase_total || derivedPhaseTotal;
    const phaseTotal = Math.max(storedPhaseTotal, derivedPhaseTotal);
    const userTokens = await fetchUserPromptTokens(userId);
    const existingAssessmentId = assessment.assessment_id;
    const existingStatus = assessment.assessment_status;
    const existingSessionId = assessment.assessment_session_id;
    let sessionId = existingSessionId || uuidv4();
    let currentPhase = assessment.assessment_current_phase || 1;
    let results = ensurePhaseResults(assessment.assessment_results || null, phaseTotal);
    results.currentPhase = currentPhase;

    const canResume =
      Boolean(existingAssessmentId) &&
      existingStatus === 'in-progress' &&
      Boolean(existingSessionId);

    if (!canResume) {
      sessionId = uuidv4();
      currentPhase = 1;
      results = ensurePhaseResults(null, phaseTotal);
      results.currentPhase = currentPhase;
      const serializedResults = JSON.stringify(results);
      await db.query(
        `INSERT INTO assessments (user_id, questionnaire_id, status, session_id, results, updated_at, current_phase, phase_total)
         VALUES (?, ?, 'in-progress', ?, ?, NOW(), ?, ?)
         ON DUPLICATE KEY UPDATE 
           status = 'in-progress',
           session_id = VALUES(session_id),
           results = VALUES(results),
           current_phase = VALUES(current_phase),
           phase_total = VALUES(phase_total),
           updated_at = NOW()`,
        [userId, questionnaireId, sessionId, serializedResults, currentPhase, phaseTotal]
      );
    } else {
      currentPhase = assessment.assessment_current_phase || results.currentPhase || 1;
      results.currentPhase = currentPhase;
      const serializedResults = JSON.stringify(results);
      await db.query(
        `UPDATE assessments 
           SET results = ?, phase_total = ?, current_phase = ?, updated_at = NOW()
         WHERE id = ?`,
        [serializedResults, phaseTotal, currentPhase, existingAssessmentId]
      );
    }

    const initialTemplate =
      getPhaseWelcomeMessage(assessment, currentPhase) ||
      assessment.initial_prompt ||
      getInitialAssessmentPrompt(assessment.title);
    const initialMessage = applyUserPromptPlaceholders(initialTemplate, userTokens);
    const nextStage = assessment.next_mystery_slug
      ? { type: 'mystery', slug: assessment.next_mystery_slug }
      : null;
    
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
        personaName: getPhasePersonaName(assessment, currentPhase),
        nextStage,
        currentPhase,
        totalPhases: phaseTotal,
      },
    });

  } catch (error) {
    console.error('Error starting assessment:', error);
    return NextResponse.json({ success: false, message: 'An internal server error occurred' }, { status: 500 });
  }
}
