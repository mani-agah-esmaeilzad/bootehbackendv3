// src/constants/questionnaireCategories.ts

export const QUESTIONNAIRE_CATEGORIES = [
  'شایستگی های رفتاری (بین فردی)',
  'شایستگی های شناختی',
  'شایستگی های فردی',
  'شایستگی های رهبری و مدیریت',
  'شایستگی‌های روانشناختی',
] as const;

export type QuestionnaireCategory = typeof QUESTIONNAIRE_CATEGORIES[number];
