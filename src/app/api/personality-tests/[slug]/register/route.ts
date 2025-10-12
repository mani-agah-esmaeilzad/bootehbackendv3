// src/app/api/personality-tests/[slug]/register/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

const enrollmentSchema = z.object({
  full_name: z.string().min(3, "نام کامل باید حداقل ۳ کاراکتر باشد."),
  email: z.string().email("ایمیل معتبر نیست."),
  phone: z.string().optional(),
  organization: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const body = await request.json();
    const validation = enrollmentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, message: validation.error.errors[0].message }, { status: 400 });
    }

    const { slug } = params;
    const [testRows]: any = await db.query(
      `SELECT id, is_active FROM personality_assessments WHERE slug = ?`,
      [slug]
    );

    if (!Array.isArray(testRows) || testRows.length === 0) {
      return NextResponse.json({ success: false, message: "آزمون مورد نظر یافت نشد." }, { status: 404 });
    }

    const test = testRows[0];
    if (!test.is_active) {
      return NextResponse.json({ success: false, message: "این آزمون در حال حاضر فعال نیست." }, { status: 403 });
    }

    const { full_name, email, phone, organization, notes } = validation.data;

    await db.query(
      `INSERT INTO personality_assessment_applications (personality_assessment_id, slug, full_name, email, phone, organization, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [test.id, slug, full_name, email, phone ?? null, organization ?? null, notes ?? null]
    );

    return NextResponse.json({ success: true, message: "درخواست شما ثبت شد. تیم ما به زودی با شما تماس می‌گیرد." });
  } catch (error) {
    console.error("Register Personality Test Error:", error);
    return NextResponse.json({ success: false, message: "خطای سرور" }, { status: 500 });
  }
}
