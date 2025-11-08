// src/lib/personality/jung.ts

import { JUNG_QUESTIONS, JUNG_QUESTION_COUNT, JungQuestion, MbtiLetter } from "@/constants/jungQuestions";

type AnswerMap = Record<number, number>;

const LETTER_LABELS: Record<MbtiLetter, string> = {
  E: "برونگرایی (E)",
  I: "درونگرایی (I)",
  S: "واقع‌گرایی (S)",
  N: "شهودگرایی (N)",
  T: "تفکر منطقی (T)",
  F: "احساس‌محوری (F)",
  J: "ساختارگرایی (J)",
  P: "انعطاف‌پذیری (P)",
};

const AXIS_CONFIG: Array<{ dimension: JungQuestion["dimension"]; letters: [MbtiLetter, MbtiLetter] }> = [
  { dimension: "EI", letters: ["I", "E"] },
  { dimension: "SN", letters: ["S", "N"] },
  { dimension: "TF", letters: ["T", "F"] },
  { dimension: "JP", letters: ["J", "P"] },
];

export const getJungQuestionSet = () => JUNG_QUESTIONS;
export { JUNG_QUESTION_COUNT };

const buildSummary = (mbti: string) =>
  `تیپ شخصیتی شما بر اساس پاسخ‌های استاندارد آزمون ۸۷ سؤالی MBTI برابر با ${mbti} برآورد شده است. اختلاف امتیاز در هر بعد میزان وضوح ترجیحات شما را نشان می‌دهد.`;

export const scoreJungAnswers = (answers: AnswerMap) => {
  const letterTotals: Record<MbtiLetter, number> = {
    E: 0,
    I: 0,
    S: 0,
    N: 0,
    T: 0,
    F: 0,
    J: 0,
    P: 0,
  };

  JUNG_QUESTIONS.forEach((question) => {
    const value = answers[question.id];
    if (value === 1) {
      letterTotals[question.optionA.letter] += question.optionA.score;
    } else if (value === 2) {
      letterTotals[question.optionB.letter] += question.optionB.score;
    }
  });

  const axes = AXIS_CONFIG.map(({ dimension, letters }) => {
    const [first, second] = letters;
    const firstRaw = letterTotals[first];
    const secondRaw = letterTotals[second];
    const axisTotal = firstRaw + secondRaw;
    const firstScore = axisTotal === 0 ? 50 : Number(((firstRaw / axisTotal) * 100).toFixed(2));
    const secondScore = Number((100 - firstScore).toFixed(2));
    const dominantLetter = firstScore >= secondScore ? first : second;

    return {
      dimension,
      primary: {
        letter: first,
        label: LETTER_LABELS[first],
        score: firstScore,
      },
      secondary: {
        letter: second,
        label: LETTER_LABELS[second],
        score: secondScore,
      },
      dominantLetter,
      dominantScore: Math.max(firstScore, secondScore),
      secondaryScore: Math.min(firstScore, secondScore),
      delta: Number(Math.abs(firstScore - secondScore).toFixed(2)),
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
    summary: buildSummary(mbti),
  };
};
