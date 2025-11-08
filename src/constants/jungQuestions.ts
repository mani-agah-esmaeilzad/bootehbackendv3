// src/constants/jungQuestions.ts

import questionBank from "@/constants/mbtiQuestions.json";
import { MBTI_SCORE_MAP, MbtiScoreEntry, MbtiDimension } from "@/constants/mbtiScoreMap";

export type MbtiLetter = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";

export type JungQuestion = {
  id: number;
  text: string;
  dimension: MbtiDimension;
  optionA: { letter: MbtiLetter; score: number };
  optionB: { letter: MbtiLetter; score: number };
};

type RawQuestion = { id: number; text: string };

const DIMENSION_OPTION_LETTERS: Record<MbtiDimension, [MbtiLetter, MbtiLetter]> = {
  EI: ["I", "E"],
  SN: ["S", "N"],
  TF: ["T", "F"],
  JP: ["J", "P"],
};

const buildQuestion = (item: RawQuestion): JungQuestion => {
  const scoring = MBTI_SCORE_MAP[item.id];
  if (!scoring) {
    throw new Error(`MBTI scoring row missing for question ${item.id}`);
  }
  const [optionALetter, optionBLetter] = DIMENSION_OPTION_LETTERS[scoring.dimension];
  return {
    id: item.id,
    text: item.text,
    dimension: scoring.dimension,
    optionA: {
      letter: optionALetter,
      score: scoring.scoreA,
    },
    optionB: {
      letter: optionBLetter,
      score: scoring.scoreB,
    },
  };
};

const RAW_QUESTIONS: RawQuestion[] = Array.isArray(questionBank.questions) ? questionBank.questions : [];

export const JUNG_QUESTIONS: JungQuestion[] = RAW_QUESTIONS.map(buildQuestion).sort((a, b) => a.id - b.id);

export const JUNG_QUESTION_COUNT = JUNG_QUESTIONS.length;
