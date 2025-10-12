// src/app/api/admin/personality-tests/[id]/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const parseHighlights = (value: any): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const personalityTestSchema = z.object({
  name: z.string().min(1, "نام آزمون نمی‌تواند خالی باشد"),
  slug: z
    .string()
    .min(1, "Slug نمی‌تواند خالی باشد")
    .regex(/^[a-z0-9-]+$/i, "Slug باید فقط شامل حروف، اعداد و خط تیره باشد"),
  tagline: z.string().min(1, "عنوان کوتاه نمی‌تواند خالی باشد"),
  description: z.string().min(1, "توضیحات آزمون نمی‌تواند خالی باشد"),
  report_name: z.string().min(1, "نام گزارش نمی‌تواند خالی باشد"),
  highlights: z.array(z.string().min(1)).min(1, "حداقل یک نکته کلیدی الزامی است"),
  is_active: z.boolean().default(true),
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const [rows]: any = await db.query(
      `SELECT id, name, slug, tagline, description, report_name, highlights, is_active, created_at, updated_at
       FROM personality_assessments
       WHERE id = ?`,
      [params.id]
    );

    if (!rows.length) {
      return NextResponse.json({ success: false, message: 'آزمون یافت نشد' }, { status: 404 });
    }

    const data = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        highlights: parseHighlights(data.highlights),
      },
    });
  } catch (error) {
    console.error("Get Personality Test Detail Error:", error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const body = await request.json();
    const validation = personalityTestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, message: validation.error.errors[0].message }, { status: 400 });
    }

    const { name, slug, tagline, description, report_name, highlights, is_active } = validation.data;

    const [result]: any = await db.query(
      `UPDATE personality_assessments
       SET name = ?, slug = ?, tagline = ?, description = ?, report_name = ?, highlights = ?, is_active = ?
       WHERE id = ?`,
      [name, slug, tagline, description, report_name, JSON.stringify(highlights), is_active, params.id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, message: 'آزمون یافت نشد' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'آزمون با موفقیت بروزرسانی شد' });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ success: false, message: 'Slug وارد شده تکراری است' }, { status: 400 });
    }
    console.error("Update Personality Test Error:", error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const [result]: any = await db.query(
      `DELETE FROM personality_assessments WHERE id = ?`,
      [params.id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, message: 'آزمون یافت نشد' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'آزمون با موفقیت حذف شد' });
  } catch (error) {
    console.error("Delete Personality Test Error:", error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
