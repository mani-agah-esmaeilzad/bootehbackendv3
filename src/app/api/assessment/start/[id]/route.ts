// src/app/api/assessment/start/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { getInitialAssessmentPrompt } from '@/lib/ai';
import { fetchUserPromptTokens, applyUserPromptPlaceholders } from '@/lib/promptPlaceholders';
import { getPhaseCount, getPhaseWelcomeMessage, getPhasePersonaName, ensurePhaseResults } from '@/lib/questionnairePhase';

export const dynamic = 'force-dynamic';

async function clearPersistedSessionState(sessionId?: string | null, assessmentId?: number | null): Promise<void> {
  if (!sessionId && !assessmentId) {
    return;
  }

  const deleteChatMessagesByAssessment = async (targetAssessmentId: number | null | undefined) => {
    if (!targetAssessmentId) return;
    try {
      await db.query('DELETE FROM chat_messages WHERE assessment_id = ?', [targetAssessmentId]);
    } catch (error) {
      console.warn(`Failed to delete chat_messages by assessment ${targetAssessmentId}:`, error);
    }
  };

  const resolveAssessmentId = async (): Promise<number | null> => {
    if (assessmentId) return assessmentId;
    if (!sessionId) return null;
    try {
      const [assessmentLookup]: any = await db.query(
        'SELECT id FROM assessments WHERE session_id = ? LIMIT 1',
        [sessionId]
      );
      if (Array.isArray(assessmentLookup) && assessmentLookup.length > 0) {
        return Number(assessmentLookup[0].id) || null;
      }
    } catch (error) {
      console.warn(`Failed to resolve assessment_id for session ${sessionId}:`, error);
    }
    return null;
  };

  if (sessionId) {
    try {
      await db.query('DELETE FROM assessment_states WHERE session_id = ?', [sessionId]);
    } catch (error) {
      console.warn(`Failed to delete assessment_states for session ${sessionId}:`, error);
    }

    const resolvedAssessmentId = await resolveAssessmentId();
    await deleteChatMessagesByAssessment(resolvedAssessmentId);
    return;
  }

  if (assessmentId) {
    try {
      await db.query('DELETE FROM assessment_states WHERE assessment_id = ?', [assessmentId]);
    } catch (error) {
      console.warn(`Failed to delete assessment_states by assessment ${assessmentId}:`, error);
    }
    await deleteChatMessagesByAssessment(assessmentId);
  }
}

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

    const [assignmentCheckRows]: any = await db.query(
      `SELECT 
         COUNT(*) AS total_assignments,
         SUM(CASE WHEN questionnaire_id = ? THEN 1 ELSE 0 END) AS matching_assignments
       FROM user_questionnaire_assignments
       WHERE user_id = ?`,
      [questionnaireId, userId]
    );
    const totalAssignments = Number(assignmentCheckRows?.[0]?.total_assignments || 0);
    const matchingAssignments = Number(assignmentCheckRows?.[0]?.matching_assignments || 0);
    if (totalAssignments > 0 && matchingAssignments === 0) {
      return NextResponse.json({ success: false, message: 'این مرحله برای حساب شما فعال نشده است' }, { status: 403 });
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
    const existingAssessmentId = assessment.assessment_id ?? null;
    const existingSessionId = assessment.assessment_session_id ?? null;
    const sessionId = uuidv4();
    const currentPhase = 1;
    const results = ensurePhaseResults(null, phaseTotal);
    results.currentPhase = currentPhase;
    const serializedResults = JSON.stringify(results);

    if (existingAssessmentId || existingSessionId) {
      await clearPersistedSessionState(existingSessionId, existingAssessmentId);
    }

    if (existingAssessmentId) {
      await db.query(
        `UPDATE assessments 
           SET status = 'in-progress',
               session_id = ?,
               results = ?,
               current_phase = ?,
               phase_total = ?,
               supplementary_answers = NULL,
               score = NULL,
               description = NULL,
               completed_at = NULL,
               updated_at = NOW()
         WHERE id = ?`,
        [sessionId, serializedResults, currentPhase, phaseTotal, existingAssessmentId]
      );
    } else {
      await db.query(
        `INSERT INTO assessments (user_id, questionnaire_id, status, session_id, results, updated_at, current_phase, phase_total)
         VALUES (?, ?, 'in-progress', ?, ?, NOW(), ?, ?)
         ON DUPLICATE KEY UPDATE 
           status = 'in-progress',
           session_id = VALUES(session_id),
           results = VALUES(results),
           current_phase = VALUES(current_phase),
           phase_total = VALUES(phase_total),
           supplementary_answers = NULL,
           score = NULL,
           description = NULL,
           completed_at = NULL,
           updated_at = NOW()`,
        [userId, questionnaireId, sessionId, serializedResults, currentPhase, phaseTotal]
      );
    }

    const [userProfileRows]: any = await db.query(
      "SELECT gender, age FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const userGender = userProfileRows.length > 0 ? userProfileRows[0].gender ?? null : null;
    const userAge = userProfileRows.length > 0 ? userProfileRows[0].age ?? null : null;

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
        userGender,
        userAge,
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
