// src/lib/ai.ts
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const AVALAI_API_KEY = process.env.AVALAI_API_KEY || '';
const AVALAI_BASE_URL = process.env.AVALAI_BASE_URL || 'https://api.avalai.ir/v1';
const DEFAULT_MODEL = "gemini-2.0-flash-lite";

if (!AVALAI_API_KEY) {
  throw new Error("AVALAI_API_KEY environment variable not set.");
}

const openai = new OpenAI({
    apiKey: AVALAI_API_KEY,
    baseURL: AVALAI_BASE_URL,
});

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * تابعی برای استخراج یک رشته JSON تمیز از داخل یک بلاک کد مارک‌داون
 */
const extractJsonFromString = (str: string): string => {
    const match = str.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return str.trim();
};

export const getInitialAssessmentPrompt = (assessmentTitle: string): string => {
    return `سلام، من دستیار هوش مصنوعی شما برای ارزیابی شایستگی «${assessmentTitle}» هستم. برای شروع، لطفاً سناریویی که برای شما تعریف می‌شود را به دقت مطالعه کرده و پاسخ خود را ارائه دهید. آماده‌اید؟`;
};

export const generateResponse = async (
  systemInstruction: string,
  history: ChatMessage[],
  model: string = DEFAULT_MODEL
): Promise<string | null> => {
  if (history.length === 0) {
    console.error("generateResponse called with empty history.");
    return "مشکلی در بازیابی تاریخچه مکالمه پیش آمده است.";
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemInstruction },
    ...history,
  ];

  try {
    const chatCompletion = await openai.chat.completions.create({
        messages: messages,
        model: model,
        temperature: 0.7,
    });
    return chatCompletion.choices[0]?.message?.content || null;
  } catch (error: any) {
    console.error("AvalAI API Error in generateResponse:", error);
    return "متاسفانه در حال حاضر قادر به پاسخگویی نیستم. لطفاً لحظاتی دیگر دوباره تلاش کنید.";
  }
};

export const generateSupplementaryQuestions = async (conversationJson: string, personaPrompt: string): Promise<{ q1: string, q2: string }> => {
    try {
        const systemPrompt = `You are an expert HR interviewer. Your task is to generate two insightful follow-up questions in Persian based on the provided conversation history and the original persona prompt. The questions should probe deeper into areas where the user was vague, or challenge them on a key competency related to the persona. **Output ONLY a valid JSON object with two keys: "question1" and "question2". Do not add any other text.**`;
        
        const userPrompt = `
            **Original Persona Prompt:**
            ${personaPrompt}

            **Conversation History (JSON):**
            ${conversationJson}
        `;

        const response = await openai.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
        });

        const textResult = response.choices[0]?.message?.content;
        if (textResult) {
            const parsed = JSON.parse(textResult);
            return {
                q1: parsed.question1 || "سوال اول ایجاد نشد.",
                q2: parsed.question2 || "سوال دوم ایجاد نشد."
            };
        }
        throw new Error("AI did not return valid content for supplementary questions.");
    } catch (error) {
        console.error("Error generating supplementary questions:", error);
        return {
            q1: "بر اساس مکالمه‌ای که داشتیم، فکر می‌کنید بزرگترین نقطه قوت شما که در این سناریو به نمایش گذاشته شد چه بود؟",
            q2: "با توجه به چالش مطرح شده، فکر می‌کنید در کدام بخش نیاز به بهبود و یادگیری بیشتری دارید؟"
        };
    }
};

export const analyzeConversation = async (conversationJson: string, analysisPrompt: string): Promise<string> => {
    try {
        const prompt = `
            ${analysisPrompt}
            
            This is the conversation history in JSON format. Analyze it based on the instructions above.
            Conversation:
            ${conversationJson}
            
            Begin Analysis (output ONLY the JSON object, without any markdown formatting):
        `;
        const response = await openai.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: [ { role: "user", content: prompt } ],
            response_format: { type: "json_object" },
        });

        const rawContent = response.choices[0]?.message?.content;
        if (!rawContent) {
            throw new Error("تحلیل مکالمه با خطا مواجه شد.");
        }

        const cleanJsonString = extractJsonFromString(rawContent);
        
        try {
            JSON.parse(cleanJsonString);
            return cleanJsonString;
        } catch (e) {
            console.error("Failed to parse cleaned JSON from AI:", cleanJsonString);
            throw new Error("پاسخ دریافتی از سرویس تحلیل، فرمت معتبری ندارد.");
        }

    } catch (error: any) {
        console.error("Error analyzing conversation:", error);
        // در صورت بروز خطا، یک JSON پیش‌فرض و معتبر برمی‌گردانیم
        return JSON.stringify({
            score: 0,
            report: `متاسفانه تحلیل این مکالمه با خطا مواجه شد. جزئیات خطا: ${error.message}`,
            factor_scores: []
        });
    }
};

type MysteryImageInfo = {
  title: string;
  description?: string | null;
  ai_notes?: string | null;
};

export const buildMysterySystemInstruction = (
  baseInstruction: string,
  images: MysteryImageInfo[]
): string => {
  if (!Array.isArray(images) || images.length === 0) {
    return baseInstruction;
  }

  const imageContext = images
    .map((image, index) => {
      const parts = [
        `تصویر ${index + 1}: ${image.title}`,
        image.description ? `توضیحات قابل نمایش: ${image.description}` : null,
        image.ai_notes ? `نکات راهنما برای تحلیل: ${image.ai_notes}` : null,
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n");

  return `${baseInstruction.trim()}\n\nاطلاعات زمینه‌ای درباره تصاویر:\n${imageContext}`;
};

type MysteryBubbleMessageInput = {
  title: string;
  aiNotes?: string | null;
  assessmentName?: string | null;
  guideName?: string | null;
  shortDescription?: string | null;
  existingText?: string | null;
};

export const generateMysteryBubbleText = async ({
  title,
  aiNotes,
  assessmentName,
  guideName,
  shortDescription,
  existingText,
}: MysteryBubbleMessageInput): Promise<string> => {
  const contextParts = [
    `عنوان تصویر: ${title}`.trim(),
    assessmentName ? `نام سناریو: ${assessmentName}` : null,
    guideName ? `نام شخصیت راهنما: ${guideName}` : null,
    shortDescription ? `خلاصه سناریو: ${shortDescription}` : null,
    aiNotes ? `نکات کلیدی تصویر: ${aiNotes}` : null,
    existingText ? `اگر متن فعلی طبیعی نبود، بهترش کن: ${existingText}` : null,
  ].filter(Boolean);

  const systemPrompt = [
    "شما یک نویسنده خلاق فارسی‌زبان هستید که باید برای حباب گفتگوی تصویری یک پیام کوتاه بسازید.",
    "پیام باید صمیمی، کمی رازآلود و دعوت‌کننده به ادامه کشف باشد.",
    "حداکثر دو جمله و حداکثر ۱۸۰ کاراکتر باشد.",
    "از گیومه و نشانه‌های نقل‌قول استفاده نکن، از اموجی استفاده نکن.",
    "از لحن دوم‌شخص مفرد استفاده کن و مستقیماً مخاطب را خطاب قرار بده.",
    "خروجی فقط متن باشد (بدون توضیح اضافه).",
  ].join(" ");

  const userPrompt = contextParts.join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error("متن مناسبی از سرویس هوش مصنوعی دریافت نشد.");
    }

    return raw.replace(/^[\"“”]+|[\"“”]+$/g, "").trim();
  } catch (error) {
    console.error("Error generating mystery bubble text:", error);
    throw new Error("تولید پیام حباب گفتگو با خطا مواجه شد.");
  }
};
