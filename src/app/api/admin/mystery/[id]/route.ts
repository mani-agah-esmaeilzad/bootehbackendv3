// src/app/api/admin/mystery/[id]/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import db, { getConnectionWithRetry } from '@/lib/database';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const normalizeImagePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname || '';
      const search = parsed.search || '';
      const hash = parsed.hash || '';
      return pathname.startsWith('/') ? `${pathname}${search}${hash}` : `/${pathname}${search}${hash}`;
    } catch {
      return trimmed;
    }
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const imageSchema = z.object({
  id: z.number().optional(),
  image_url: z
    .string({ required_error: 'وارد کردن آدرس تصویر الزامی است.' })
    .min(1, { message: 'آدرس تصویر نباید خالی باشد.' })
    .refine((value) => {
      const trimmed = value.trim();
      return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/');
    }, { message: 'آدرس تصویر معتبر نیست. از لینک کامل یا مسیر نسبی (شروع با /) استفاده کنید.' }),
  title: z.string().min(3, { message: 'عنوان تصویر باید حداقل ۳ کاراکتر باشد.' }),
  description: z.string().optional(),
  ai_notes: z.string().optional(),
  display_order: z.number().int().min(0).optional(),
});

const assessmentSchema = z.object({
  name: z.string().min(3, { message: 'نام آزمون باید حداقل ۳ کاراکتر باشد.' }),
  slug: z
    .string()
    .min(3, { message: 'اسلاگ باید حداقل ۳ کاراکتر باشد.' })
    .regex(/^[a-z0-9-]+$/i, { message: 'اسلاگ فقط می‌تواند شامل حروف انگلیسی، اعداد و خط تیره باشد.' }),
  short_description: z.string().min(20, { message: 'توضیح کوتاه باید حداقل ۲۰ کاراکتر باشد.' }),
  intro_message: z.string().min(10, { message: 'پیام آغاز آزمون باید حداقل ۱۰ کاراکتر باشد.' }),
  guide_name: z.string().min(2, { message: 'نام راهنمای گفتگو باید حداقل ۲ کاراکتر باشد.' }).optional(),
  system_prompt: z.string().min(30, { message: 'پرامپت سیستم باید حداقل ۳۰ کاراکتر باشد.' }),
  analysis_prompt: z.string().optional(),
  bubble_prompt: z.string().optional(),
  is_active: z.boolean().optional().default(true),
  images: z.array(imageSchema).min(1, { message: 'حداقل یک تصویر باید ثبت شود.' }),
});

const ensureAdmin = async () => {
  const session = await getSession();
  if (!session.user || session.user.role !== 'admin') {
    return { errorResponse: NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 }) };
  }
  return { session };
};

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  let connection: any;
  try {
    const { errorResponse } = await ensureAdmin();
    if (errorResponse) return errorResponse;

    const assessmentId = Number(params.id);
    if (!assessmentId) {
      return NextResponse.json({ success: false, message: 'شناسه آزمون نامعتبر است.' }, { status: 400 });
    }

    const body = await request.json();
    const validation = assessmentSchema.safeParse(body);
    if (!validation.success) {
      const message = validation.error.errors[0]?.message || 'داده‌های ارسالی نامعتبر است.';
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    const {
      name,
      slug,
      short_description,
      intro_message,
      guide_name,
      system_prompt,
      analysis_prompt,
      bubble_prompt,
      is_active,
      images,
    } = validation.data;

    connection = await getConnectionWithRetry();

    try {
      await connection.beginTransaction();

      await connection.query(
        `
          UPDATE mystery_assessments
          SET name = ?, slug = ?, short_description = ?, intro_message = ?, guide_name = ?, system_prompt = ?, analysis_prompt = ?, bubble_prompt = ?, is_active = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [
          name.trim(),
          slug.trim().toLowerCase(),
          short_description.trim(),
          intro_message.trim(),
          (guide_name || 'رازمَستر').trim(),
          system_prompt.trim(),
          analysis_prompt?.trim() || null,
          bubble_prompt?.trim() || null,
          is_active ? 1 : 0,
          assessmentId,
        ]
      );

      await connection.query(
        `DELETE FROM mystery_assessment_images WHERE mystery_assessment_id = ?`,
        [assessmentId]
      );

      const imageValues = images.map((image, index) => [
        assessmentId,
        normalizeImagePath(image.image_url),
        image.title.trim(),
        image.description?.trim() || null,
        image.ai_notes?.trim() || null,
        image.display_order ?? index,
      ]);

      await connection.query(
        `
          INSERT INTO mystery_assessment_images
            (mystery_assessment_id, image_url, title, description, ai_notes, display_order)
          VALUES ?
        `,
        [imageValues]
      );

      await connection.commit();
    } catch (error: any) {
      if (connection) await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        return NextResponse.json({ success: false, message: 'اسلاگ انتخاب‌شده تکراری است.' }, { status: 400 });
      }
      throw error;
    } finally {
      if (connection) connection.release();
    }

    return NextResponse.json({ success: true, message: 'آزمون با موفقیت بروزرسانی شد.' });
  } catch (error) {
    console.error('Admin Mystery PUT error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { errorResponse } = await ensureAdmin();
    if (errorResponse) return errorResponse;

    const assessmentId = Number(params.id);
    if (!assessmentId) {
      return NextResponse.json({ success: false, message: 'شناسه آزمون نامعتبر است.' }, { status: 400 });
    }

    await db.query(`DELETE FROM mystery_assessments WHERE id = ?`, [assessmentId]);

    return NextResponse.json({ success: true, message: 'آزمون حذف شد.' });
  } catch (error) {
    console.error('Admin Mystery DELETE error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
