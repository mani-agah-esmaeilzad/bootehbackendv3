// src/app/api/personality/form/finish/[sessionId]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { getJungQuestionSet, JUNG_QUESTION_COUNT } from '@/lib/personality/jung';
import { scoreJungAnswers } from '@/lib/personality/jung';

const FORM_SLUGS = new Set(['jung', 'mbti']);

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.userId) {
      return NextResponse.json({ success: false, message: 'برای پایان آزمون وارد شوید.' }, { status: 401 });
    }

    const sessionUuid = params.sessionId;
    if (!sessionUuid) {
      return NextResponse.json({ success: false, message: 'شناسه جلسه نامعتبر است.' }, { status: 400 });
    }

    const body = await request.json();
    const answers = Array.isArray(body?.answers) ? body.answers : [];
    if (!answers.length) {
      return NextResponse.json({ success: false, message: 'هیچ پاسخی ارسال نشده است.' }, { status: 400 });
    }

    const [rows]: any = await db.query(
      `SELECT ps.id, ps.user_id, ps.results, ps.status, pa.id as assessment_id, pa.slug, pa.name
         FROM personality_sessions ps
         JOIN personality_assessments pa ON ps.personality_assessment_id = pa.id
        WHERE ps.session_uuid = ?`,
      [sessionUuid]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, message: 'جلسه‌ای برای این شناسه یافت نشد.' }, { status: 404 });
    }

    const record = rows[0];
    if (record.user_id !== session.user.userId) {
      return NextResponse.json({ success: false, message: 'به این جلسه دسترسی ندارید.' }, { status: 403 });
    }

    if (!FORM_SLUGS.has(record.slug)) {
      return NextResponse.json({ success: false, message: 'این آزمون با حالت فرم سازگار نیست.' }, { status: 400 });
    }

    const questionSet = getJungQuestionSet();
    if (answers.length !== questionSet.length) {
      return NextResponse.json({
        success: false,
        message: `پاسخ به تمام ${questionSet.length} سؤال الزامی است.`,
      }, { status: 400 });
    }

    const answerMap = answers.reduce((map: Record<number, number>, entry: any) => {
      if (
        entry &&
        typeof entry.questionId === 'number' &&
        typeof entry.value === 'number'
      ) {
        map[entry.questionId] = entry.value;
      }
      return map;
    }, {});

    if (Object.keys(answerMap).length !== questionSet.length) {
      return NextResponse.json({ success: false, message: 'پاسخ برخی سؤالات ارسال نشده است.' }, { status: 400 });
    }

    const hasInvalidAnswer = questionSet.some((question) => {
      const value = answerMap[question.id];
      return value !== 1 && value !== 2;
    });

    if (hasInvalidAnswer) {
      return NextResponse.json({ success: false, message: 'برای هر سؤال فقط گزینه‌ الف یا ب معتبر است.' }, { status: 400 });
    }

    const analysis = scoreJungAnswers(answerMap);

    await db.query(
      `UPDATE personality_sessions
          SET status = 'completed',
              results = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [
        JSON.stringify({
          mode: 'form',
          slug: record.slug,
          questionCount: JUNG_QUESTION_COUNT,
          answers: answerMap,
          analysis,
        }),
        record.id,
      ]
    );

    return NextResponse.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Finish personality form error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
