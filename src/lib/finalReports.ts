// src/lib/finalReports.ts

import { QUESTIONNAIRE_CATEGORIES } from '@/constants/questionnaireCategories';

const ADDITIONAL_CATEGORY = 'سایر دسته‌بندی‌ها';
export const CATEGORY_SEQUENCE = [...QUESTIONNAIRE_CATEGORIES, ADDITIONAL_CATEGORY];

const CATEGORY_ALIASES: Record<string, string> = {
  'نیمرخ روانشناختی': 'شایستگی‌های روانشناختی',
};

const PERSIAN_DIGIT_MAP: Record<string, string> = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === 'string') {
    let normalized = value.trim();
    if (!normalized) return null;
    normalized = normalized.replace(/[۰-۹]/g, (digit) => PERSIAN_DIGIT_MAP[digit] ?? digit);
    normalized = normalized.replace(/,/g, '').replace(/٪|%/g, '');
    normalized = normalized.replace(/[^\d.+-]/g, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const splitTextItems = (value: string): string[] => {
  const items = value
    .split(/\r?\n|[•▪●◦]| - /g)
    .map((item) => item.replace(/^[-–—•▪●◦]+/, '').trim())
    .filter(Boolean);
  if (items.length > 0) return items;
  const fallback = value.replace(/^[-–—•▪●◦]+/, '').trim();
  return fallback ? [fallback] : [];
};

export const normalizeCategoryName = (category?: string | null): string => {
  if (!category) return ADDITIONAL_CATEGORY;
  const trimmed = category.trim();
  if (!trimmed) return ADDITIONAL_CATEGORY;
  return CATEGORY_ALIASES[trimmed] ?? trimmed;
};

const collectTextItems = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextItems(entry));
  }
  if (typeof value === 'string') {
    return splitTextItems(value);
  }
  if (typeof value === 'object') {
    if ('title' in (value as Record<string, unknown>)) {
      return collectTextItems((value as Record<string, unknown>).title);
    }
    if ('label' in (value as Record<string, unknown>)) {
      return collectTextItems((value as Record<string, unknown>).label);
    }
    if ('text' in (value as Record<string, unknown>)) {
      return collectTextItems((value as Record<string, unknown>).text);
    }
    return Object.values(value as Record<string, unknown>).flatMap((entry) => collectTextItems(entry));
  }
  return [];
};

const dedupeList = (items: string[], maxItems = 12): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawItem of items) {
    const item = rawItem.trim();
    if (!item) continue;
    const key = item.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= maxItems) break;
  }
  return result;
};

const parseFactorScores = (analysis: any) => {
  const source = analysis?.factor_scores;
  const entries: Array<{ name: string; score: number; maxScore: number }> = [];
  const processEntry = (entry: any, index: number) => {
    const name =
      entry?.subject ||
      entry?.factor ||
      entry?.name ||
      entry?.label ||
      `فاکتور ${index + 1}`;
    const score = toNumber(
      entry?.score ??
        entry?.value ??
        entry?.actual ??
        entry?.current ??
        entry?.raw ??
        entry?.scoreValue
    );
    const maxScore = toNumber(entry?.maxScore ?? entry?.fullMark ?? 5) || 5;
    if (score === null) return;
    entries.push({
      name,
      score,
      maxScore,
    });
  };

  if (Array.isArray(source)) {
    source.forEach((entry, index) => processEntry(entry, index));
  } else if (source && typeof source === 'object') {
    Object.entries(source).forEach(([key, value], index) => {
      if (typeof value === 'object') {
        processEntry({ name: key, ...(value as Record<string, unknown>) }, index);
      } else {
        const numeric = toNumber(value);
        if (numeric !== null) {
          entries.push({ name: key, score: numeric, maxScore: 5 });
        }
      }
    });
  }

  return entries;
};

const computeNormalizedScore = (analysis: any, fallbackMax: number) => {
  const directScore =
    toNumber(analysis?.score) ??
    toNumber(analysis?.overall_score) ??
    toNumber(analysis?.total_score) ??
    toNumber(analysis?.readiness_index) ??
    toNumber(analysis?.readiness_score);

  const maxScore =
    toNumber(analysis?.max_score) ??
    toNumber(analysis?.maximum) ??
    toNumber(analysis?.full_mark) ??
    fallbackMax ??
    100;

  if (directScore !== null && maxScore && maxScore > 0) {
    const normalized = clamp((directScore / maxScore) * 100);
    return {
      rawScore: directScore,
      normalized,
      maxScore,
    };
  }

  const factorScores = parseFactorScores(analysis);
  if (factorScores.length > 0) {
    const aggregate = factorScores.reduce(
      (acc, item) => {
        if (!item.maxScore) return acc;
        acc.raw += (item.score / item.maxScore) * 100;
        acc.count += 1;
        return acc;
      },
      { raw: 0, count: 0 },
    );
    if (aggregate.count > 0) {
      const normalized = clamp(aggregate.raw / aggregate.count);
      return {
        rawScore: normalized,
        normalized,
        maxScore: 100,
      };
    }
  }

  return {
    rawScore: 0,
    normalized: 0,
    maxScore: maxScore || 100,
  };
};

const extractSummary = (analysis: any): string | null => {
  if (!analysis) return null;
  if (typeof analysis.summary === 'string') {
    const trimmed = analysis.summary.trim();
    if (trimmed) return trimmed;
  }
  if (Array.isArray(analysis.summary)) {
    const joined = analysis.summary.map((item: any) => String(item).trim()).filter(Boolean).join(' ');
    if (joined) return joined;
  }
  if (typeof analysis.report === 'string') {
    const trimmed = analysis.report.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

export interface AssignmentInfo {
  user_id: number;
  questionnaire_id: number;
  questionnaire_title: string;
  display_order: number | null;
  category: string | null;
  max_score: number | null;
}

export interface CompletedAssessmentInfo {
  assessment_id: number;
  user_id: number;
  questionnaire_id: number;
  questionnaire_title: string;
  questionnaire_display_order: number | null;
  category: string | null;
  completed_at: string | null;
  results: any;
  max_score: number | null;
}

export interface ParsedCompletion {
  assessmentId: number;
  questionnaireId: number;
  questionnaireTitle: string;
  category: string;
  completedAt: string | null;
  normalizedScore: number;
  rawScore: number;
  maxScore: number;
  summary: string | null;
  strengths: string[];
  recommendations: string[];
  developmentPlan: string[];
  risks: string[];
  factorScores: Array<{ name: string; score: number; maxScore: number }>;
}

export interface CategoryContribution {
  assessmentId: number;
  questionnaireId: number;
  questionnaireTitle: string;
  normalizedScore: number;
  rawScore: number;
  maxScore: number;
  completedAt: string | null;
}

export interface CategorySummary {
  key: string;
  label: string;
  normalizedScore: number;
  completedCount: number;
  totalAssignments: number;
  contributions: CategoryContribution[];
}

export interface RadarPoint {
  subject: string;
  userScore: number;
  targetScore: number;
}

export interface PowerWheelSegment {
  label: string;
  value: number;
  status: 'pending' | 'partial' | 'completed';
  completedCount: number;
  totalAssignments: number;
}

export interface AggregatedFinalReport {
  userId: number;
  assignedCount: number;
  completedCount: number;
  completionRate: number;
  isReady: boolean;
  lastCompletedAt: string | null;
  categories: CategorySummary[];
  radar: RadarPoint[];
  powerWheel: PowerWheelSegment[];
  assessments: ParsedCompletion[];
  pendingAssignments: AssignmentInfo[];
  strengths: string[];
  recommendations: string[];
  developmentPlan: string[];
  risks: string[];
  overallNormalized: number;
  averageScore: number;
}

export interface UserBasicInfo {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: number | boolean;
}

export const parseAssessmentResult = (raw: any) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
};

export const transformCompletionRow = (row: CompletedAssessmentInfo): ParsedCompletion => {
  const parsedResults = parseAssessmentResult(row.results);
  const finalAnalysis = parsedResults?.final_analysis ?? parsedResults ?? {};
  const factorScores = parseFactorScores(finalAnalysis);
  const { rawScore, normalized, maxScore } = computeNormalizedScore(finalAnalysis, row.max_score ?? 100);
  const summary = extractSummary(finalAnalysis);
  const strengths = collectTextItems(finalAnalysis?.strengths);
  const recommendations = collectTextItems(finalAnalysis?.recommendations ?? finalAnalysis?.development_plan);
  const developmentPlan = collectTextItems(finalAnalysis?.development_plan);
  const risks = collectTextItems(finalAnalysis?.risk_flags ?? finalAnalysis?.risk_indicators);

  return {
    assessmentId: row.assessment_id,
    questionnaireId: row.questionnaire_id,
    questionnaireTitle: row.questionnaire_title,
    category: normalizeCategoryName(row.category),
    completedAt: row.completed_at,
    normalizedScore: Number(normalized.toFixed(2)),
    rawScore: Number(rawScore.toFixed(2)),
    maxScore: maxScore || 100,
    summary,
    strengths,
    recommendations,
    developmentPlan,
    risks,
    factorScores,
  };
};

export const buildAggregatedFinalReport = (
  user: UserBasicInfo,
  assignments: AssignmentInfo[],
  completions: ParsedCompletion[],
): AggregatedFinalReport | null => {
  if (!assignments || assignments.length === 0) return null;

  const assignmentOrderMap = new Map<number, number>();
  const categoryAssignmentCounts = new Map<string, number>();
  assignments.forEach((assignment, index) => {
    assignmentOrderMap.set(assignment.questionnaire_id, assignment.display_order ?? index);
    const normalizedCategory = normalizeCategoryName(assignment.category);
    categoryAssignmentCounts.set(
      normalizedCategory,
      (categoryAssignmentCounts.get(normalizedCategory) ?? 0) + 1
    );
  });

  const assignedSet = new Set(assignments.map((item) => item.questionnaire_id));
  const completionByQuestionnaire = new Map<number, ParsedCompletion>();

  completions.forEach((completion) => {
    if (!assignedSet.has(completion.questionnaireId)) return;
    const existing = completionByQuestionnaire.get(completion.questionnaireId);
    if (!existing) {
      completionByQuestionnaire.set(completion.questionnaireId, completion);
      return;
    }
    if (!existing.completedAt) {
      completionByQuestionnaire.set(completion.questionnaireId, completion);
      return;
    }
    if (!completion.completedAt) return;
    if (completion.completedAt > existing.completedAt) {
      completionByQuestionnaire.set(completion.questionnaireId, completion);
    }
  });

  const orderedCompletions = Array.from(completionByQuestionnaire.values()).sort((a, b) => {
    const orderA = assignmentOrderMap.get(a.questionnaireId) ?? 0;
    const orderB = assignmentOrderMap.get(b.questionnaireId) ?? 0;
    return orderA - orderB;
  });

  const assignedCount = assignments.length;
  const completedCount = orderedCompletions.length;
  const completionRate = assignedCount > 0 ? completedCount / assignedCount : 0;
  const isReady = assignedCount > 0 && completedCount >= assignedCount;

  const categoryMap = new Map<string, CategorySummary>();
  CATEGORY_SEQUENCE.forEach((label, index) => {
    categoryMap.set(label, {
      key: `category_${index}`,
      label,
      normalizedScore: 0,
      completedCount: 0,
      totalAssignments: categoryAssignmentCounts.get(label) ?? 0,
      contributions: [],
    });
  });

  const pendingAssignments = assignments.filter(
    (assignment) => !completionByQuestionnaire.has(assignment.questionnaire_id)
  );

  let totalNormalized = 0;
  let totalRaw = 0;
  let lastCompletedAt: string | null = null;

  orderedCompletions.forEach((completion) => {
    totalNormalized += completion.normalizedScore;
    totalRaw += completion.rawScore;
    if (completion.completedAt && (!lastCompletedAt || completion.completedAt > lastCompletedAt)) {
      lastCompletedAt = completion.completedAt;
    }
    const category = categoryMap.get(completion.category) ?? categoryMap.get(ADDITIONAL_CATEGORY)!;
    category.completedCount += 1;
    category.normalizedScore += completion.normalizedScore;
    category.contributions.push({
      assessmentId: completion.assessmentId,
      questionnaireId: completion.questionnaireId,
      questionnaireTitle: completion.questionnaireTitle,
      normalizedScore: completion.normalizedScore,
      rawScore: completion.rawScore,
      maxScore: completion.maxScore,
      completedAt: completion.completedAt,
    });
  });

  const categories: CategorySummary[] = Array.from(categoryMap.values()).map((entry) => ({
    ...entry,
    normalizedScore:
      entry.completedCount > 0
        ? Number((entry.normalizedScore / entry.completedCount).toFixed(2))
        : 0,
  }));

  const radar: RadarPoint[] = categories.map((entry) => ({
    subject: entry.label,
    userScore: Number(entry.normalizedScore.toFixed(2)),
    targetScore: 100,
  }));

  const powerWheel: PowerWheelSegment[] = categories.map((entry) => {
    let status: PowerWheelSegment['status'] = 'pending';
    if (entry.completedCount === 0) status = 'pending';
    else if (entry.completedCount < entry.totalAssignments) status = 'partial';
    else status = 'completed';
    return {
      label: entry.label,
      value: Number(entry.normalizedScore.toFixed(2)),
      status,
      completedCount: entry.completedCount,
      totalAssignments: entry.totalAssignments,
    };
  });

  const strengths = dedupeList(
    orderedCompletions.flatMap((completion) => completion.strengths),
    12
  );

  const recommendations = dedupeList(
    orderedCompletions.flatMap((completion) => completion.recommendations),
    12
  );

  const developmentPlan = dedupeList(
    orderedCompletions.flatMap((completion) => completion.developmentPlan),
    12
  );

  const risks = dedupeList(
    orderedCompletions.flatMap((completion) => completion.risks),
    12
  );

  const overallNormalized = completedCount > 0 ? Number((totalNormalized / completedCount).toFixed(2)) : 0;
  const averageRaw = completedCount > 0 ? Number((totalRaw / completedCount).toFixed(2)) : 0;

  return {
    userId: user.id,
    assignedCount,
    completedCount,
    completionRate,
    isReady,
    lastCompletedAt,
    categories,
    radar,
    powerWheel,
    assessments: orderedCompletions,
    pendingAssignments,
    strengths,
    recommendations,
    developmentPlan,
    risks,
    overallNormalized,
    averageScore: averageRaw,
  };
};
