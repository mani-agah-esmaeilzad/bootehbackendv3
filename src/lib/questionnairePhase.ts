// src/lib/questionnairePhase.ts

import type { RowDataPacket } from 'mysql2';

type QuestionnaireRow = RowDataPacket & {
  persona_name?: string | null;
  persona_prompt?: string | null;
  analysis_prompt?: string | null;
  welcome_message?: string | null;
  phase_two_persona_name?: string | null;
  phase_two_persona_prompt?: string | null;
  phase_two_analysis_prompt?: string | null;
  phase_two_welcome_message?: string | null;
  total_phases?: number | null;
};

type AssessmentResults = {
  version?: string;
  history?: any[];
  phases?: Array<{
    phase: number;
    history: any[];
    supplementary_answers?: Record<string, any> | null;
  }>;
  currentPhase?: number;
  supplementary_answers?: Record<string, any> | null;
};

export const getPhaseCount = (questionnaire: QuestionnaireRow): number => {
  if (questionnaire.total_phases && questionnaire.total_phases > 0) {
    return questionnaire.total_phases;
  }
  return questionnaire.phase_two_persona_prompt ? 2 : 1;
};

export const getPhasePersonaName = (
  questionnaire: QuestionnaireRow,
  phase: number
): string | null => {
  if (phase === 1) {
    return questionnaire.persona_name || null;
  }
  return questionnaire.phase_two_persona_name || questionnaire.persona_name || null;
};

export const getPhasePersonaPrompt = (
  questionnaire: QuestionnaireRow,
  phase: number
): string | null => {
  if (phase === 1) {
    return questionnaire.persona_prompt || null;
  }
  return questionnaire.phase_two_persona_prompt || questionnaire.persona_prompt || null;
};

export const getPhaseAnalysisPrompt = (
  questionnaire: QuestionnaireRow,
  phase: number
): string | null => {
  if (phase === 1) {
    return questionnaire.analysis_prompt || null;
  }
  return questionnaire.phase_two_analysis_prompt || questionnaire.analysis_prompt || null;
};

export const getPhaseWelcomeMessage = (
  questionnaire: QuestionnaireRow,
  phase: number
): string | null => {
  if (phase === 1) {
    return questionnaire.welcome_message || null;
  }
  return questionnaire.phase_two_welcome_message || questionnaire.welcome_message || null;
};

export const ensurePhaseResults = (
  rawResults: string | null,
  totalPhases: number
): AssessmentResults => {
  const parsed: AssessmentResults = rawResults ? JSON.parse(rawResults) : {};
  if (!Array.isArray(parsed.phases)) {
    const existingHistory = Array.isArray(parsed.history) ? parsed.history : [];
    parsed.phases = [
      {
        phase: 1,
        history: existingHistory,
        supplementary_answers: parsed.supplementary_answers || null,
      },
    ];
  }
  for (let i = parsed.phases.length + 1; i <= totalPhases; i += 1) {
    parsed.phases.push({ phase: i, history: [], supplementary_answers: null });
  }
  parsed.history = parsed.phases[0]?.history || [];
  parsed.version = parsed.version || '2.0';
  return parsed;
};

export const flattenPhaseHistory = (results: AssessmentResults): any[] => {
  if (Array.isArray(results.phases)) {
    return results.phases.flatMap((phase) => Array.isArray(phase.history) ? phase.history : []);
  }
  return Array.isArray(results.history) ? results.history : [];
};
