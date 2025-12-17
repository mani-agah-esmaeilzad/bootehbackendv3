// src/app/api/assessment/tts/route.ts

import { NextResponse } from 'next/server';
import { authenticateToken, getSession } from '@/lib/auth';

const AVALAI_API_KEY = process.env.AVALAI_API_KEY;
const AVALAI_SPEECH_ENDPOINT = 'https://api.avalai.ir/v1/audio/speech';
const AVALAI_CHAT_COMPLETIONS_ENDPOINT = 'https://api.avalai.ir/v1/chat/completions';
const FALLBACK_TTS_MODEL = process.env.AVALAI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const FALLBACK_TTS_VOICE = process.env.AVALAI_TTS_VOICE || 'Kore';
const FALLBACK_TTS_LANGUAGE = process.env.AVALAI_TTS_LANGUAGE || 'en-US';
const FALLBACK_TTS_FORMAT = (process.env.AVALAI_TTS_FORMAT || 'mp3').toLowerCase();
const GEMINI_PCM_SAMPLE_RATE = Number(process.env.AVALAI_TTS_SAMPLE_RATE || 24000);

const isGeminiModel = FALLBACK_TTS_MODEL.toLowerCase().includes('gemini');

const buildWavFromPcm16 = (pcmBuffer: Buffer, sampleRate = GEMINI_PCM_SAMPLE_RATE) => {
  const channelCount = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channelCount * (bitsPerSample / 8);
  const blockAlign = channelCount * (bitsPerSample / 8);
  const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);

  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16); // PCM header length
  wavBuffer.writeUInt16LE(1, 20); // audio format = PCM
  wavBuffer.writeUInt16LE(channelCount, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(wavBuffer, 44);
  return wavBuffer;
};

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

    const instructionParts = [
      personaName ? `صدای شخصیت "${personaName}" را بازآفرینی کن.` : null,
      'متن را به فارسی معیار بخوان و اگر محدودیت زبانی وجود داشت آن را با لهجه دری/افغانی بیان کن.',
      'لحن حرفه‌ای، گرم و طبیعی داشته باش و کلمات انگلیسی را واضح ادا کن.',
    ].filter(Boolean);

    if (isGeminiModel) {
      const messages = [
        instructionParts.length
          ? { role: 'system', content: instructionParts.join(' ') }
          : null,
        { role: 'user', content: normalizedText },
      ].filter(Boolean);

      const payload = {
        model: FALLBACK_TTS_MODEL,
        messages,
        modalities: ['audio'],
        audio: {
          voice: FALLBACK_TTS_VOICE,
          format: 'pcm16',
        },
      };

      const avalaiResponse = await fetch(AVALAI_CHAT_COMPLETIONS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AVALAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await avalaiResponse.json().catch(() => null);
      if (!avalaiResponse.ok || !data) {
        console.error('AvalAI TTS error (chat completions):', avalaiResponse.status, data);
        return NextResponse.json(
          { success: false, message: 'تولید صدا با خطا مواجه شد.' },
          { status: avalaiResponse.status === 401 ? 502 : 500 }
        );
      }

      const choice = data?.choices?.[0];
      let audioBase64 = choice?.message?.audio?.data ?? null;
      if (!audioBase64 && Array.isArray(choice?.message?.content)) {
        const audioPart = choice.message.content.find((part: any) => part?.type === 'audio');
        audioBase64 = audioPart?.audio?.data ?? null;
      }

      if (!audioBase64) {
        console.error('AvalAI TTS error: audio payload missing', data);
        return NextResponse.json(
          { success: false, message: 'داده صوتی از سرویس دریافت نشد.' },
          { status: 500 }
        );
      }

      const pcmBuffer = Buffer.from(audioBase64, 'base64');
      const wavBuffer = buildWavFromPcm16(pcmBuffer);

      return new NextResponse(wavBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(wavBuffer.length),
          'Cache-Control': 'no-store',
        },
      });
    } else {
      const payload = {
        model: FALLBACK_TTS_MODEL,
        input: normalizedText,
        voice: {
          name: FALLBACK_TTS_VOICE,
          languageCode: FALLBACK_TTS_LANGUAGE,
        },
        response_format: FALLBACK_TTS_FORMAT,
        instructions: instructionParts.join(' '),
      };

      const avalaiResponse = await fetch(AVALAI_SPEECH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AVALAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!avalaiResponse.ok) {
        const errorText = await avalaiResponse.text().catch(() => 'خطای نامشخص از AvalAI');
        console.error('AvalAI TTS error (speech endpoint):', avalaiResponse.status, errorText);
        return NextResponse.json(
          { success: false, message: 'تولید صدا با خطا مواجه شد.' },
          { status: avalaiResponse.status === 401 ? 502 : 500 }
        );
      }

      const audioBuffer = Buffer.from(await avalaiResponse.arrayBuffer());
      const contentType =
        FALLBACK_TTS_FORMAT === 'mp3'
          ? 'audio/mpeg'
          : FALLBACK_TTS_FORMAT === 'wav'
            ? 'audio/wav'
            : FALLBACK_TTS_FORMAT === 'opus'
              ? 'audio/ogg'
              : FALLBACK_TTS_FORMAT === 'aac'
                ? 'audio/aac'
                : FALLBACK_TTS_FORMAT === 'flac'
                  ? 'audio/flac'
                  : 'audio/pcm';

      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(audioBuffer.length),
          'Cache-Control': 'no-store',
        },
      });
    }
  } catch (error) {
    console.error('TTS route error:', error);
    return NextResponse.json(
      { success: false, message: 'خطای غیرمنتظره در تولید صدا رخ داد.' },
      { status: 500 }
    );
  }
}
