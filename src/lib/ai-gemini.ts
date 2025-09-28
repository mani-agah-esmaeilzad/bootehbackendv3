// src/lib/ai-gemini.ts

import OpenAI from 'openai';
import { ConversationHistoryMessage } from '@/lib/ai-conversations';

// اینترفیس برای هماهنگی ساختار خروجی تابع با بقیه بخش‌های کد
export interface ContinueConversationResponse {
    text: string;
    isComplete: boolean;
}

// ۱. تنظیمات اتصال به AvalAI (که از API سازگار با OpenAI استفاده می‌کند)
const openai = new OpenAI({
    apiKey: process.env.AVALAI_API_KEY, // مطمئن شوید نام متغیر در فایل .env صحیح است
    baseURL: 'https://api.avalai.ir/v1',
});

/**
 * تابع کمکی برای تبدیل تاریخچه گفتگوی پروژه به فرمت مورد نیاز OpenAI.
 * این تابع نقش کلیدی در سازگاری داده‌ها دارد.
 */
function formatHistoryForAI(history: ConversationHistoryMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return history.map(msg => ({
        // نقش 'model' در پروژه ما، معادل 'assistant' در OpenAI است
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.parts.map(p => p.text).join('\n')
    }));
}

// ==================================================================
// توابع اصلی که در پس‌زمینه کار می‌کنند
// ==================================================================

/**
 * این تابع برای ادامه دادن یک مکالمه طراحی شده است.
 */
async function getAIAssistantResponse(
    history: ConversationHistoryMessage[],
    personaPrompt: string
): Promise<ContinueConversationResponse> {
    try {
        // ۱. ساخت آرایه پیام‌ها با فرمت صحیح برای ارسال به API
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            // پیام سیستمی که شخصیت و وظایف هوش مصنوعی را تعیین می‌کند
            { role: 'system', content: personaPrompt },
            // کل تاریخچه گفتگو که به فرمت صحیح تبدیل شده است
            ...formatHistoryForAI(history)
        ];

        // ۲. ارسال درخواست به مدل gpt-4o-mini
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
        });

        const responseText = chatCompletion.choices[0]?.message?.content?.trim() ?? '';
        
        // ۳. بررسی پاسخ برای پیدا کردن کلمه کلیدی پایان مکالمه
        const isComplete = responseText.includes('__CONVERSATION_END__');
        
        // ۴. تمیز کردن متن پاسخ و برگرداندن نتیجه در قالب یک آبجکت استاندارد
        return {
            text: responseText.replace('__CONVERSATION_END__', '').trim(),
            isComplete: isComplete,
        };

    } catch (error) {
        console.error('Error in getAIAssistantResponse:', error);
        throw new Error('Failed to get AI response.');
    }
}

/**
 * این تابع برای تحلیل یک گفتگو و استخراج اطلاعات خاص از آن استفاده می‌شود.
 */
async function getAIAnalysis(
    history: ConversationHistoryMessage[],
    analysisPrompt: string
): Promise<string> {
    try {
        // تبدیل کل تاریخچه گفتگو به یک رشته متنی برای تحلیل
        const conversationText = history.map(msg => `${msg.role}: ${msg.parts.map(p => p.text).join('\n')}`).join('\n\n');
        const analysisRequest = `${analysisPrompt}\n\nConversation History:\n${conversationText}`;

        // ارسال درخواست به مدل قدرتمندتر gpt-4o برای تحلیل دقیق
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: 'system', content: "You are an expert analyst. Respond ONLY with the requested format (e.g., JSON)." },
                { role: 'user', content: analysisRequest }
            ],
        });

        return chatCompletion.choices[0]?.message?.content?.trim() ?? '';
    } catch (error) {
        console.error('Error in getAIAnalysis:', error);
        throw new Error('Failed to get AI analysis.');
    }
}

// ==================================================================
// توابع نهایی که از پروژه Export می‌شوند
// ==================================================================

export async function continueConversation(history: ConversationHistoryMessage[], personaPrompt: string): Promise<ContinueConversationResponse> {
    return getAIAssistantResponse(history, personaPrompt);
}

export async function analyzeForSecondaryAI(history: ConversationHistoryMessage[], secondaryPersonaPrompt: string): Promise<string> {
    // پرامپت دقیق برای ناظر: اگر نیاز به مداخله نیست، عبارت خاصی را برگردان
    const prompt = `${secondaryPersonaPrompt}\nReview the conversation. If you need to intervene, write your message. Otherwise, return ONLY the exact phrase '__NO_INTERVENTION__'.`;
    return getAIAnalysis(history, prompt);
}

export async function generateSupplementaryQuestions(history: ConversationHistoryMessage[], evaluationCriteria?: string): Promise<string> {
    // پرامپت دقیق برای تولید سوالات تکمیلی در قالب JSON
    const prompt = `Based on the conversation and evaluation criteria, generate 3 supplementary questions.
    Evaluation Criteria: ${evaluationCriteria || 'General assessment'}
    Return ONLY a valid JSON array of strings. Example: ["question1", "question2", "question3"]`;
    return getAIAnalysis(history, prompt);
}

export async function generateFinalReport(
    history: ConversationHistoryMessage[], 
    supplementaryAnswers: { question: string, answer: string }[], 
    evaluationCriteria?: string
): Promise<string> {
    const supplementaryText = supplementaryAnswers.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');
    
    // پرامپت دقیق برای تولید گزارش نهایی در قالب JSON
    const prompt = `Generate a comprehensive final report as a JSON object with keys for "summary", "strengths", "areasForImprovement", and "finalScore" (out of 10).
    Evaluation Criteria: ${evaluationCriteria || 'General assessment'}
    Supplementary Answers:
    ${supplementaryText}
    `;
    return getAIAnalysis(history, prompt);
}
