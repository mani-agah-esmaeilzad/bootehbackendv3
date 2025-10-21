// src/app/api/admin/mystery/images/generate-text/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { generateMysteryBubbleText } from '@/lib/ai';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  title: z.string({ required_error: 'عنوان تصویر الزامی است.' }).min(3, { message: 'عنوان تصویر باید حداقل ۳ کاراکتر باشد.' }),
  ai_notes: z.string().optional(),
  assessment_name: z.string().optional(),
  guide_name: z.string().optional(),
  short_description: z.string().optional(),
  existing_text: z.string().optional(),
});

const ensureAdmin = async () => {
  const session = await getSession();
  if (!session.user || session.user.role !== 'admin') {
    return { errorResponse: NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 }) };
  }
  return { session };
};

export async function POST(request: Request) {
  try {
    const { errorResponse } = await ensureAdmin();
    if (errorResponse) return errorResponse;

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, message: 'بدنه درخواست نامعتبر است.' }, { status: 400 });
    }

    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      const message = validation.error.errors[0]?.message || 'اطلاعات ارسالی معتبر نیست.';
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    const payload = validation.data;

    const text = await generateMysteryBubbleText({
      title: payload.title.trim(),
      aiNotes: payload.ai_notes?.trim() || null,
      assessmentName: payload.assessment_name?.trim() || null,
      guideName: payload.guide_name?.trim() || null,
      shortDescription: payload.short_description?.trim() || null,
      existingText: payload.existing_text?.trim() || null,
    });

    return NextResponse.json({
      success: true,
      data: {
        text,
      },
    });
  } catch (error: any) {
    console.error('Admin mystery image text generation error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'تولید متن حباب گفتگو با خطا روبرو شد.' },
      { status: 500 }
    );
  }
}
