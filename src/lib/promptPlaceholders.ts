// src/lib/promptPlaceholders.ts

import db from "@/lib/database";

type RawUserRow = {
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  work_experience?: string | null;
  age?: number | null;
};

export type UserPromptTokens = {
  userName: string;
  userJob: string;
  userAge: string;
};

const DEFAULT_TOKENS: UserPromptTokens = {
  userName: "دوست عزیز",
  userJob: "شغل شما",
  userAge: "سن شما",
};

const buildFullName = (user?: RawUserRow): string => {
  const first = user?.first_name?.trim() ?? "";
  const last = user?.last_name?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  if (full.length > 0) return full;
  const username = user?.username?.trim();
  if (username && username.length > 0) return username;
  return DEFAULT_TOKENS.userName;
};

export const buildUserPromptTokens = (user?: RawUserRow | null): UserPromptTokens => {
  if (!user) return { ...DEFAULT_TOKENS };
  return {
    userName: buildFullName(user),
    userJob: user.work_experience?.trim() && user.work_experience.trim().length > 0
      ? user.work_experience.trim()
      : DEFAULT_TOKENS.userJob,
    userAge: typeof user.age === "number" && !Number.isNaN(user.age)
      ? `${user.age}`
      : DEFAULT_TOKENS.userAge,
  };
};

export const applyUserPromptPlaceholders = (
  text: string | null | undefined,
  tokens?: UserPromptTokens
): string => {
  if (typeof text !== "string" || text.length === 0) {
    return text ?? "";
  }
  const replacements = tokens ?? DEFAULT_TOKENS;
  return text
    .replace(/\{user_name\}/gi, replacements.userName)
    .replace(/\{user_job\}/gi, replacements.userJob)
    .replace(/\{user_age\}/gi, replacements.userAge);
};

export const fetchUserPromptTokens = async (userId: number): Promise<UserPromptTokens> => {
  const [rows]: any = await db.query(
    `SELECT username, first_name, last_name, work_experience, age FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return buildUserPromptTokens(rows[0]);
  }
  return { ...DEFAULT_TOKENS };
};

