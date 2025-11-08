// src/lib/personality/jung.ts

import { JUNG_QUESTIONS, JungQuestion } from "@/constants/jungQuestions";

type AnswerMap = Record<number, number>;

const LETTER_PAIRS: Record<JungQuestion["dimension"], { primary: "E" | "S" | "T" | "J"; secondary: "I" | "N" | "F" | "P" }> = {
  EI: { primary: "E", secondary: "I" },
  SN: { primary: "S", secondary: "N" },
  TF: { primary: "T", secondary: "F" },
  JP: { primary: "J", secondary: "P" },
};

const LETTER_LABELS: Record<string, string> = {
  E: "برونگرایی (E)",
  I: "درونگرایی (I)",
  S: "واقع‌گرایی (S)",
  N: "شهودگرایی (N)",
  T: "تفکر منطقی (T)",
  F: "احساس‌محوری (F)",
  J: "ساختارگرایی (J)",
  P: "انعطاف‌پذیری (P)",
};

export const getJungQuestionSet = () => JUNG_QUESTIONS;

export const scoreJungAnswers = (answers: AnswerMap) => {
  const letterTotals: Record<string, { sum: number; count: number }> = {
    E: { sum: 0, count: 0 },
    I: { sum: 0, count: 0 },
    S: { sum: 0, count: 0 },
    N: { sum: 0, count: 0 },
    T: { sum: 0, count: 0 },
    F: { sum: 0, count: 0 },
    J: { sum: 0, count: 0 },
    P: { sum: 0, count: 0 },
  };

  JUNG_QUESTIONS.forEach((question) => {
    const value = answers[question.id];
    if (!value || value < 1 || value > 5) return;
    letterTotals[question.letter].sum += value;
    letterTotals[question.letter].count += 1;
  });

  const normalize = (letter: string) => {
    const { sum, count } = letterTotals[letter];
    if (count === 0) return 0;
    return Number(((sum - count) / (count * 4) * 100).toFixed(2)); // converts 1-5 scale to 0-100
  };

  const axes = Object.entries(LETTER_PAIRS).map(([dimension, pair]) => {
    const primaryScore = normalize(pair.primary);
    const secondaryScore = normalize(pair.secondary);
    const letter =
      primaryScore >= secondaryScore ? pair.primary : pair.secondary;
    const dominantScore = Math.max(primaryScore, secondaryScore);
    const secondary = Math.min(primaryScore, secondaryScore);

    return {
      dimension,
      primary: {
        letter: pair.primary,
        label: LETTER_LABELS[pair.primary],
        score: primaryScore,
      },
      secondary: {
        letter: pair.secondary,
        label: LETTER_LABELS[pair.secondary],
        score: secondaryScore,
      },
      dominantLetter: letter,
      dominantScore,
      secondaryScore: secondary,
      delta: Number((Math.abs(primaryScore - secondaryScore)).toFixed(2)),
    };
  });

  const mbti = axes.map((axis) => axis.dominantLetter).join("");

  const radar = axes.flatMap((axis) => [
    {
      subject: axis.primary.label,
      score: axis.primary.score,
      fullMark: 100,
    },
    {
      subject: axis.secondary.label,
      score: axis.secondary.score,
      fullMark: 100,
    },
  ]);

  return {
    mbti,
    axes,
    radar,
    summary: `تیپ شخصیتی شما بر اساس پاسخ‌ها ${mbti} برآورد شده است. این نتیجه بر مبنای نسخه‌ی ۶۴ سؤالی آزمون تایپولوژی یونگ محاسبه شده و توازن هر بعد را در نمودار نشان می‌دهد.`,
  };
};
