// src/constants/questionnaireCategories.ts

export const QUESTIONNAIRE_CATEGORIES = [
  'مهارت‌های ارتباطی',
  'هوش هیجانی',
  'رهبری و مدیریت',
  'توسعه فردی',
  'کار تیمی',
] as const;

export type QuestionnaireCategory = typeof QUESTIONNAIRE_CATEGORIES[number];
