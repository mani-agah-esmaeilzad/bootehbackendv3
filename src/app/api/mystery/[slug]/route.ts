// src/app/api/mystery/[slug]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { generateMysteryBubbleText } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    if (!slug) {
      return NextResponse.json({ success: false, message: 'شناسه آزمون نامعتبر است.' }, { status: 400 });
    }

    const [testRows]: any = await db.query(
      `
        SELECT id, name, slug, short_description, intro_message, guide_name, bubble_prompt, created_at
        FROM mystery_assessments
        WHERE slug = ? AND is_active = 1
        LIMIT 1
      `,
      [slug]
    );

    if (!Array.isArray(testRows) || testRows.length === 0) {
      return NextResponse.json({ success: false, message: 'آزمون مورد نظر یافت نشد.' }, { status: 404 });
    }

    const assessment = testRows[0];

    const [imageRows]: any = await db.query(
      `
        SELECT id, title, description, image_url, ai_notes, display_order
        FROM mystery_assessment_images
        WHERE mystery_assessment_id = ?
        ORDER BY display_order ASC, id ASC
      `,
      [assessment.id]
    );

    const requestUrl = new URL(request.url);
    const assetBase =
      process.env.NEXT_PUBLIC_ASSET_ORIGIN ||
      process.env.APP_BASE_URL ||
      `${requestUrl.protocol}//${requestUrl.host}`;

    const resolveImageUrl = (value: string): string => {
      if (!value) return value;
      if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
      }
      if (value.startsWith('/')) {
        return `${assetBase}${value}`;
      }
      return `${assetBase}/${value}`;
    };

    const fallbackBubbleTexts = [
      "سرنخ‌ها را پشت هم بچین؛ تصویر با تو حرف می‌زند.",
      "پرونده زیر نور چراغ جان می‌گیرد؛ دنبال جرقه باش.",
      "سایه‌ها را کنار بزن و آنچه پنهان شده را ببین.",
      "هیچ جزئیاتی تصادفی نیست؛ با صبر همه چیز رو می‌شود.",
      "هر خط دفترچه روایتی دارد؛ رمز آن را بخوان.",
      "ردپای حقیقت همین‌جاست؛ کافی است دقیق نگاه کنی.",
    ];
    const randomFallback = () =>
      fallbackBubbleTexts[Math.floor(Math.random() * fallbackBubbleTexts.length)] ?? fallbackBubbleTexts[0];
    const trimmedBubblePrompt =
      typeof assessment.bubble_prompt === 'string' && assessment.bubble_prompt.trim().length > 0
        ? assessment.bubble_prompt.trim()
        : '';

    const imagesWithDescription = await Promise.all(
      imageRows.map(async (image: any, index: number) => {
        const manualDescription =
          typeof image.description === 'string' && image.description.trim().length > 0
            ? image.description.trim()
            : '';

        const matchesBubblePrompt =
          manualDescription.length > 0 &&
          trimmedBubblePrompt.length > 0 &&
          manualDescription === trimmedBubblePrompt;

        const shouldGenerate = manualDescription.length === 0 || matchesBubblePrompt;

        if (!shouldGenerate) {
          const { ai_notes, ...rest } = image;
          return {
            ...rest,
            description: manualDescription,
          };
        }

        let generatedText: string | null = null;

        try {
          generatedText = await generateMysteryBubbleText({
            title: image.title?.trim() || `تصویر ${index + 1}`,
            aiNotes: image.ai_notes?.trim() || null,
            assessmentName: assessment.name,
            guideName: assessment.guide_name,
            shortDescription: assessment.short_description,
            bubblePrompt: trimmedBubblePrompt,
            imageUrl: resolveImageUrl(image.image_url),
          });
        } catch (error) {
          console.error('Mystery bubble generation error:', error);
        }

        const finalText =
          typeof generatedText === 'string' && generatedText.trim().length > 0
            ? generatedText.trim()
            : randomFallback();

        const { ai_notes, ...rest } = image;
        return {
          ...rest,
          description: finalText,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        ...assessment,
        images: imagesWithDescription,
      },
    });
  } catch (error) {
    console.error('Get Mystery Assessment Detail Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
