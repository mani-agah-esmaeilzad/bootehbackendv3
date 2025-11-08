// src/app/api/personality/form/[slug]/start/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { getJungQuestionSet, JUNG_QUESTION_COUNT } from '@/lib/personality/jung';

const FORM_TESTS: Record<string, { questionCount: number; getQuestions: () => ReturnType<typeof getJungQuestionSet> }> = {
  jung: {
    questionCount: JUNG_QUESTION_COUNT,
    getQuestions: getJungQuestionSet,
  },
  mbti: {
    questionCount: JUNG_QUESTION_COUNT,
    getQuestions: getJungQuestionSet,
  },
};

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای شروع آزمون وارد شوید.' }, { status: 401 });
    }

    const slug = params.slug?.toLowerCase();
    if (!slug || !FORM_TESTS[slug]) {
      return NextResponse.json({ success: false, message: 'آزمون در دسترس نیست.' }, { status: 404 });
    }

    const [assessmentRows]: any = await db.query(
      `SELECT id, name FROM personality_assessments WHERE slug = ? LIMIT 1`,
      [slug]
    );

    if (!Array.isArray(assessmentRows) || assessmentRows.length === 0) {
      return NextResponse.json({ success: false, message: 'آزمون مورد نظر یافت نشد.' }, { status: 404 });
    }

    const assessment = assessmentRows[0];
    const sessionUuid = uuidv4();
    const questions = FORM_TESTS[slug].getQuestions();

    await db.query(
      `INSERT INTO personality_sessions (user_id, personality_assessment_id, session_uuid, status, results)
       VALUES (?, ?, ?, 'in-progress', ?)`,
      [
        session.user.userId,
        assessment.id,
        sessionUuid,
        JSON.stringify({
          mode: 'form',
          slug,
          answers: [],
        }),
      ]
    );

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionUuid,
        testName: assessment.name,
        questionCount: questions.length,
        scale: {
          min: 1,
          max: 2,
          labels: ['گزینه الف', 'گزینه ب'],
        },
        questions: questions.map((question) => ({
          id: question.id,
          text: question.text,
          dimension: question.dimension,
        })),
      },
    });
  } catch (error) {
    console.error('Start personality form error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
