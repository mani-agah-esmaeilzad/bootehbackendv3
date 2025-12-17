// src/app/api/assessment/tts/route.ts

import { NextResponse } from 'next/server';
import { authenticateToken, getSession } from '@/lib/auth';

const AVALAI_API_KEY = process.env.AVALAI_API_KEY;
const AVALAI_TTS_ENDPOINT = 'https://api.avalai.ir/v1/audio/speech';
const FALLBACK_TTS_MODEL = process.env.AVALAI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const FALLBACK_TTS_VOICE = process.env.AVALAI_TTS_VOICE || 'Kore';
const FALLBACK_TTS_LANGUAGE = process.env.AVALAI_TTS_LANGUAGE || 'en-US';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!AVALAI_API_KEY) {
    return NextResponse.json(
      { success: false, message: 'کلید AvalAI روی سرور تنظیم نشده است.' },
      { status: 500 }
    );
  }

  let session = await getSession();

  if (!session.user?.userId) {
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (bearerToken) {
      const decoded = authenticateToken(bearerToken);
      if (decoded) {
        session = {
          user: {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            organizationId: decoded.organizationId,
          },
        };
      }
    }
  }

  if (!session.user?.userId) {
    return NextResponse.json(
      { success: false, message: 'احراز هویت لازم است' },
      { status: 401 }
    );
  }

  try {
    const { text, personaName } = await request.json();
    const normalizedText = typeof text === 'string' ? text.trim() : '';

    if (!normalizedText) {
      return NextResponse.json(
        { success: false, message: 'متن معتبری برای تبدیل ارسال نشده است.' },
        { status: 400 }
      );
    }

    const payload = {
      model: FALLBACK_TTS_MODEL,
      input: normalizedText,
      voice: {
        name: FALLBACK_TTS_VOICE,
        languageCode: FALLBACK_TTS_LANGUAGE,
      },
      response_format: 'mp3',
      instructions: [
        personaName ? `صدای شخصیت "${personaName}" را بازآفرینی کن.` : null,
        'متن را به فارسی معیار بخوان و اگر با محدودیت زبانی روبه‌رو شدی با لهجه دری/افغانی آن را بیان کن.',
        'با انرژی متعادل و لحن حرفه‌ای صحبت کن و اعداد یا اصطلاحات انگلیسی را واضح ادا کن.',
      ]
        .filter(Boolean)
        .join(' '),
    };

    const avalaiResponse = await fetch(AVALAI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AVALAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!avalaiResponse.ok) {
      const errorText = await avalaiResponse.text().catch(() => 'خطای نامشخص از AvalAI');
      console.error('AvalAI TTS error:', avalaiResponse.status, errorText);
      return NextResponse.json(
        { success: false, message: 'تولید صدا با خطا مواجه شد.' },
        { status: avalaiResponse.status === 401 ? 502 : 500 }
      );
    }

    const audioBuffer = Buffer.from(await avalaiResponse.arrayBuffer());

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('TTS route error:', error);
    return NextResponse.json(
      { success: false, message: 'خطای غیرمنتظره در تولید صدا رخ داد.' },
      { status: 500 }
    );
  }
}
