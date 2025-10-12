// src/app/api/admin/personality-tests/route.ts

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

export async function GET() {
  try {
    const session = await getSession();
    if (!session.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
    }

    const [rows]: any = await db.query(
      `SELECT id, name, slug, tagline, description, report_name, highlights, is_active, created_at, updated_at
       FROM personality_assessments
       ORDER BY created_at DESC`
    );

    const data = rows.map((row: any) => ({
      ...row,
      highlights: parseHighlights(row.highlights),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Get Admin Personality Tests Error:", error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    await db.query(
      `INSERT INTO personality_assessments (name, slug, tagline, description, report_name, highlights, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, slug, tagline, description, report_name, JSON.stringify(highlights), is_active]
    );

    return NextResponse.json({ success: true, message: 'آزمون جدید با موفقیت ایجاد شد' });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ success: false, message: 'Slug وارد شده تکراری است' }, { status: 400 });
    }
    console.error("Create Personality Test Error:", error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
