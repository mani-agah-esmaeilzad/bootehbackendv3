// src/app/api/admin/mystery/route.ts

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

export async function GET() {
  try {
    const { errorResponse } = await ensureAdmin();
    if (errorResponse) return errorResponse;

    const [tests]: any = await db.query(
      `
        SELECT id, name, slug, short_description, intro_message, guide_name, system_prompt, analysis_prompt, bubble_prompt, is_active, created_at, updated_at
        FROM mystery_assessments
        ORDER BY created_at DESC
      `
    );

    if (!Array.isArray(tests) || tests.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const testIds = tests.map((test: any) => test.id);
    const [images]: any = await db.query(
      `
        SELECT id, mystery_assessment_id, image_url, title, description, ai_notes, display_order
        FROM mystery_assessment_images
        WHERE mystery_assessment_id IN (?)
        ORDER BY display_order ASC, id ASC
      `,
      [testIds]
    );

    const imagesByAssessment = images.reduce((acc: Record<number, any[]>, image: any) => {
      if (!acc[image.mystery_assessment_id]) {
        acc[image.mystery_assessment_id] = [];
      }
      acc[image.mystery_assessment_id].push(image);
      return acc;
    }, {});

    const data = tests.map((test: any) => ({
      ...test,
      bubble_prompt: test.bubble_prompt ?? null,
      images: imagesByAssessment[test.id] || [],
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Admin Mystery GET error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let connection: any;
  try {
    const { errorResponse } = await ensureAdmin();
    if (errorResponse) return errorResponse;

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

      const [result]: any = await connection.query(
        `
          INSERT INTO mystery_assessments
            (name, slug, short_description, intro_message, guide_name, system_prompt, analysis_prompt, bubble_prompt, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        ]
      );

      const assessmentId = result.insertId;

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

    return NextResponse.json({ success: true, message: 'آزمون رازمایی با موفقیت ایجاد شد.' });
  } catch (error) {
    console.error('Admin Mystery POST error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
