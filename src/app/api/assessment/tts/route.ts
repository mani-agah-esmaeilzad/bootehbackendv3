// src/app/api/assessment/tts/route.ts

import { NextResponse } from 'next/server';
import { authenticateToken, getSession } from '@/lib/auth';

const AVALAI_API_KEY = process.env.AVALAI_API_KEY;
const AVALAI_SPEECH_ENDPOINT = 'https://api.avalai.ir/v1/audio/speech';
const AVALAI_CHAT_COMPLETIONS_ENDPOINT = 'https://api.avalai.ir/v1/chat/completions';

const PRIMARY_TTS_MODEL = process.env.AVALAI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const PRIMARY_TTS_VOICE = process.env.AVALAI_TTS_VOICE || 'Kore';
const PRIMARY_TTS_LANGUAGE = process.env.AVALAI_TTS_LANGUAGE || 'en-US';
const PRIMARY_SPEECH_FORMAT = (process.env.AVALAI_TTS_FORMAT || 'mp3').toLowerCase();
const GEMINI_PCM_SAMPLE_RATE = Number(process.env.AVALAI_TTS_SAMPLE_RATE || 24000);

const SECONDARY_TTS_MODEL = process.env.AVALAI_TTS_FALLBACK_MODEL || 'tts-1';
const SECONDARY_TTS_VOICE = process.env.AVALAI_TTS_FALLBACK_VOICE || 'nova';
const SECONDARY_TTS_LANGUAGE = process.env.AVALAI_TTS_FALLBACK_LANGUAGE || 'fa-IR';
const SECONDARY_TTS_FORMAT = (process.env.AVALAI_TTS_FALLBACK_FORMAT || 'mp3').toLowerCase();

const isPrimaryGeminiModel = PRIMARY_TTS_MODEL.toLowerCase().includes('gemini');

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

const detectContentType = (format: string) => {
  const lower = (format || '').toLowerCase();
  if (lower === 'mp3') return 'audio/mpeg';
  if (lower === 'wav' || lower === 'wave') return 'audio/wav';
  if (lower === 'opus' || lower === 'ogg') return 'audio/ogg';
  if (lower === 'aac') return 'audio/aac';
  if (lower === 'flac') return 'audio/flac';
  return 'audio/pcm';
};

type SpeechSynthesisParams = {
  model: string;
  text: string;
  voiceName: string;
  languageCode?: string;
  format: string;
  instructions?: string | null;
};

const synthesizeWithSpeechEndpoint = async ({
  model,
  text,
  voiceName,
  languageCode,
  format,
  instructions,
}: SpeechSynthesisParams) => {
  const lowerModel = model.toLowerCase();
  const isGeminiSpeechModel = lowerModel.includes('gemini');
  const voicePayload = isGeminiSpeechModel
    ? { name: voiceName, languageCode: languageCode || PRIMARY_TTS_LANGUAGE }
    : voiceName;

  const payload: Record<string, any> = {
    model,
    input: text,
    voice: voicePayload,
    response_format: format,
  };

  if (instructions && !lowerModel.startsWith('tts-1')) {
    payload.instructions = instructions;
  }

  const response = await fetch(AVALAI_SPEECH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AVALAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'خطای نامشخص از AvalAI');
    console.error('AvalAI speech synthesis error:', response.status, errorText);
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: detectContentType(format),
  };
};

const sendBinaryResponse = (buffer: Buffer, contentType: string) =>
  new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
    },
  });

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
    const instructionText = instructionParts.length ? instructionParts.join(' ') : null;

    if (isPrimaryGeminiModel) {
      const messages = [
        instructionText ? { role: 'system', content: instructionText } : null,
        { role: 'user', content: normalizedText },
      ].filter(Boolean);

      const payload = {
        model: PRIMARY_TTS_MODEL,
        messages,
        modalities: ['audio'],
        audio: {
          voice: PRIMARY_TTS_VOICE,
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
      if (avalaiResponse.ok && data) {
        const choice = data?.choices?.[0];
        let audioBase64 = choice?.message?.audio?.data ?? null;
        if (!audioBase64 && Array.isArray(choice?.message?.content)) {
          const audioPart = choice.message.content.find((part: any) => part?.type === 'audio');
          audioBase64 = audioPart?.audio?.data ?? null;
        }

        if (audioBase64) {
          const pcmBuffer = Buffer.from(audioBase64, 'base64');
          const wavBuffer = buildWavFromPcm16(pcmBuffer);
          return sendBinaryResponse(wavBuffer, 'audio/wav');
        }

        console.error('AvalAI TTS error: audio payload missing', data);
        return NextResponse.json(
          { success: false, message: 'داده صوتی از سرویس دریافت نشد.' },
          { status: 500 }
        );
      }

      const shouldFallback =
        avalaiResponse.status >= 500 ||
        avalaiResponse.status === 429 ||
        avalaiResponse.status === 408;

      if (shouldFallback) {
        const fallbackResult = await synthesizeWithSpeechEndpoint({
          model: SECONDARY_TTS_MODEL,
          text: normalizedText,
          voiceName: SECONDARY_TTS_VOICE,
          languageCode: SECONDARY_TTS_LANGUAGE,
          format: SECONDARY_TTS_FORMAT,
          instructions: instructionText,
        });

        if (fallbackResult) {
          return sendBinaryResponse(fallbackResult.buffer, fallbackResult.contentType);
        }
      }

      console.error('AvalAI TTS error (chat completions):', avalaiResponse.status, data);
      return NextResponse.json(
        { success: false, message: 'تولید صدا با خطا مواجه شد.' },
        { status: avalaiResponse.status === 401 ? 502 : 500 }
      );
    } else {
      const speechResult = await synthesizeWithSpeechEndpoint({
        model: PRIMARY_TTS_MODEL,
        text: normalizedText,
        voiceName: PRIMARY_TTS_VOICE,
        languageCode: PRIMARY_TTS_LANGUAGE,
        format: PRIMARY_SPEECH_FORMAT,
        instructions: instructionText,
      });

      if (speechResult) {
        return sendBinaryResponse(speechResult.buffer, speechResult.contentType);
      }

      return NextResponse.json(
        { success: false, message: 'تولید صدا با خطا مواجه شد.' },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('TTS route error:', error);
    return NextResponse.json(
      { success: false, message: 'خطای غیرمنتظره در تولید صدا رخ داد.' },
      { status: 500 }
    );
  }
}
