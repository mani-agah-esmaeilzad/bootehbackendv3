// src/app/api/admin/user-stages/[id]/route.ts

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import db from '@/lib/database';
import { requireAdmin } from '@/lib/auth/guards';

const assignmentSchema = z.object({
  questionnaireIds: z.array(z.number().int().positive()).default([]),
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
    const guard = await requireAdmin(request);
    if (!guard.ok) {
        return guard.response;
    }

  try {
const userId = parseInt(params.id, 10);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ success: false, message: 'شناسه کاربر نامعتبر است' }, { status: 400 });
    }

    const [userRows] = await db.query<RowDataPacket[]>(
      `SELECT id, username, first_name, last_name, email, is_active 
       FROM users 
       WHERE id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return NextResponse.json({ success: false, message: 'کاربر یافت نشد' }, { status: 404 });
    }

    const [assignmentRows] = await db.query<RowDataPacket[]>(
      `SELECT 
         uqa.questionnaire_id,
         uqa.display_order,
         q.name,
         q.category
       FROM user_questionnaire_assignments uqa
       JOIN questionnaires q ON q.id = uqa.questionnaire_id
       WHERE uqa.user_id = ?
       ORDER BY uqa.display_order ASC, q.display_order ASC, q.id ASC`,
      [userId]
    );

    const assignedQuestionnaireIds = assignmentRows.map((row) => row.questionnaire_id);
    const assignedQuestionnaires = assignmentRows.map((row) => ({
      id: row.questionnaire_id,
      name: row.name,
      category: row.category,
      display_order: row.display_order,
    }));

    return NextResponse.json({
      success: true,
      data: {
        user: userRows[0],
        assignedQuestionnaireIds,
        assignedQuestionnaires,
      },
    });
  } catch (error) {
    console.error('Get User Stage Detail Error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
    const guard = await requireAdmin(request);
    if (!guard.ok) {
        return guard.response;
    }

  try {
const userId = parseInt(params.id, 10);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ success: false, message: 'شناسه کاربر نامعتبر است' }, { status: 400 });
    }

    const body = await request.json();
    const validation = assignmentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, message: 'لیست مراحل ارسال‌شده معتبر نیست' }, { status: 400 });
    }

    const uniqueQuestionnaireIds = Array.from(
      new Set(validation.data.questionnaireIds.filter((id) => typeof id === 'number' && id > 0))
    );

    const [userRows] = await db.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (userRows.length === 0) {
      return NextResponse.json({ success: false, message: 'کاربر یافت نشد' }, { status: 404 });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('DELETE FROM user_questionnaire_assignments WHERE user_id = ?', [userId]);

      if (uniqueQuestionnaireIds.length > 0) {
        const values = uniqueQuestionnaireIds.map((questionnaireId, index) => [
          userId,
          questionnaireId,
          index + 1,
        ]);
        await connection.query(
          'INSERT INTO user_questionnaire_assignments (user_id, questionnaire_id, display_order) VALUES ?',
          [values]
        );
      }

      await connection.commit();
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    } finally {
      connection.release();
    }

    return NextResponse.json({
      success: true,
      message: 'مراحل کاربر با موفقیت بروزرسانی شد',
      data: { assignedCount: uniqueQuestionnaireIds.length },
    });
  } catch (error) {
    console.error('Update User Stage Assignments Error:', error);
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}