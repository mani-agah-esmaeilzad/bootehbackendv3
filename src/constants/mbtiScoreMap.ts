// src/constants/mbtiScoreMap.ts

export type MbtiDimension = "EI" | "SN" | "TF" | "JP";

export type MbtiScoreEntry = {
  id: number;
  dimension: MbtiDimension;
  scoreA: number;
  scoreB: number;
};

const DIMENSION_BY_ID = (id: number): MbtiDimension => {
  if (id >= 1 && id <= 25) return "EI";
  if (id >= 26 && id <= 42) return "SN";
  if (id >= 43 && id <= 68) return "TF";
  if (id >= 69 && id <= 87) return "JP";
  throw new Error(`Invalid MBTI question id: ${id}`);
};

const RAW_ROWS: Array<{ id: number; scoreA: number; scoreB: number }> = [
  { id: 1, scoreA: 1, scoreB: 2 },
  { id: 2, scoreA: 2, scoreB: 2 },
  { id: 3, scoreA: 2, scoreB: 2 },
  { id: 4, scoreA: 0, scoreB: 1 },
  { id: 5, scoreA: 1, scoreB: 2 },
  { id: 6, scoreA: 1, scoreB: 1 },
  { id: 7, scoreA: 2, scoreB: 2 },
  { id: 8, scoreA: 1, scoreB: 0 },
  { id: 9, scoreA: 0, scoreB: 1 },
  { id: 10, scoreA: 0, scoreB: 1 },
  { id: 11, scoreA: 2, scoreB: 2 },
  { id: 12, scoreA: 2, scoreB: 2 },
  { id: 13, scoreA: 2, scoreB: 1 },
  { id: 14, scoreA: 1, scoreB: 2 },
  { id: 15, scoreA: 0, scoreB: 1 },
  { id: 16, scoreA: 1, scoreB: 2 },
  { id: 17, scoreA: 2, scoreB: 2 },
  { id: 18, scoreA: 2, scoreB: 1 },
  { id: 19, scoreA: 2, scoreB: 2 },
  { id: 20, scoreA: 2, scoreB: 2 },
  { id: 21, scoreA: 1, scoreB: 1 },
  { id: 22, scoreA: 2, scoreB: 0 },
  { id: 23, scoreA: 1, scoreB: 2 },
  { id: 24, scoreA: 1, scoreB: 2 },
  { id: 25, scoreA: 1, scoreB: 1 },
  { id: 26, scoreA: 2, scoreB: 2 },
  { id: 27, scoreA: 1, scoreB: 1 },
  { id: 28, scoreA: 2, scoreB: 2 },
  { id: 29, scoreA: 2, scoreB: 2 },
  { id: 30, scoreA: 2, scoreB: 1 },
  { id: 31, scoreA: 1, scoreB: 2 },
  { id: 32, scoreA: 2, scoreB: 1 },
  { id: 33, scoreA: 2, scoreB: 1 },
  { id: 34, scoreA: 2, scoreB: 2 },
  { id: 35, scoreA: 1, scoreB: 1 },
  { id: 36, scoreA: 2, scoreB: 2 },
  { id: 37, scoreA: 1, scoreB: 1 },
  { id: 38, scoreA: 1, scoreB: 1 },
  { id: 39, scoreA: 0, scoreB: 2 },
  { id: 40, scoreA: 2, scoreB: 1 },
  { id: 41, scoreA: 0, scoreB: 2 },
  { id: 42, scoreA: 1, scoreB: 0 },
  { id: 43, scoreA: 1, scoreB: 2 },
  { id: 44, scoreA: 2, scoreB: 2 },
  { id: 45, scoreA: 1, scoreB: 0 },
  { id: 46, scoreA: 1, scoreB: 2 },
  { id: 47, scoreA: 1, scoreB: 1 },
  { id: 48, scoreA: 0, scoreB: 1 },
  { id: 49, scoreA: 1, scoreB: 0 },
  { id: 50, scoreA: 1, scoreB: 0 },
  { id: 51, scoreA: 1, scoreB: 0 },
  { id: 52, scoreA: 1, scoreB: 0 },
  { id: 53, scoreA: 2, scoreB: 2 },
  { id: 54, scoreA: 2, scoreB: 2 },
  { id: 55, scoreA: 1, scoreB: 1 },
  { id: 56, scoreA: 1, scoreB: 1 },
  { id: 57, scoreA: 2, scoreB: 2 },
  { id: 58, scoreA: 0, scoreB: 2 },
  { id: 59, scoreA: 2, scoreB: 0 },
  { id: 60, scoreA: 0, scoreB: 1 },
  { id: 61, scoreA: 2, scoreB: 0 },
  { id: 62, scoreA: 1, scoreB: 2 },
  { id: 63, scoreA: 0, scoreB: 2 },
  { id: 64, scoreA: 1, scoreB: 1 },
  { id: 65, scoreA: 2, scoreB: 2 },
  { id: 66, scoreA: 1, scoreB: 2 },
  { id: 67, scoreA: 0, scoreB: 2 },
  { id: 68, scoreA: 0, scoreB: 2 },
  { id: 69, scoreA: 0, scoreB: 2 },
  { id: 70, scoreA: 1, scoreB: 1 },
  { id: 71, scoreA: 2, scoreB: 2 },
  { id: 72, scoreA: 1, scoreB: 2 },
  { id: 73, scoreA: 1, scoreB: 2 },
  { id: 74, scoreA: 2, scoreB: 2 },
  { id: 75, scoreA: 2, scoreB: 2 },
  { id: 76, scoreA: 1, scoreB: 2 },
  { id: 77, scoreA: 2, scoreB: 2 },
  { id: 78, scoreA: 1, scoreB: 1 },
  { id: 79, scoreA: 2, scoreB: 1 },
  { id: 80, scoreA: 1, scoreB: 2 },
  { id: 81, scoreA: 2, scoreB: 0 },
  { id: 82, scoreA: 2, scoreB: 1 },
  { id: 83, scoreA: 2, scoreB: 2 },
  { id: 84, scoreA: 2, scoreB: 2 },
  { id: 85, scoreA: 2, scoreB: 2 },
  { id: 86, scoreA: 1, scoreB: 1 },
  { id: 87, scoreA: 1, scoreB: 2 },
];

export const MBTI_SCORE_TABLE: MbtiScoreEntry[] = RAW_ROWS.map((row) => ({
  ...row,
  dimension: DIMENSION_BY_ID(row.id),
}));

export const MBTI_SCORE_MAP: Record<number, MbtiScoreEntry> = MBTI_SCORE_TABLE.reduce(
  (acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  },
  {} as Record<number, MbtiScoreEntry>
);
