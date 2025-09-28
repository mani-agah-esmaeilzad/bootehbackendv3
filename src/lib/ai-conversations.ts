// src/lib/ai-conversations.ts
import { PoolConnection } from 'mysql2/promise';

// ========= تعریف ساختار داده‌ها (Types) ===========
// این بخش بدون تغییر باقی می‌ماند تا با بقیه پروژه سازگار باشد

interface MessagePart {
    text: string;
}

export interface ConversationHistoryMessage {
    role: 'user' | 'model';
    parts: MessagePart[];
}

export interface ConversationState {
    sessionId: string;
    assessmentId: number;
    history: ConversationHistoryMessage[];
    personaPrompt?: string;
    personaName?: string;
    secondaryPersonaPrompt?: string;
    secondaryPersonaName?: string;
    evaluationCriteria?: string;
    lastUpdated: Date;
}

// ========= توابع بازنویسی شده برای کار با دیتابیس قدیمی ===========

/**
 * وظیفه: دریافت وضعیت کامل یک گفتگو از دو جدول assessment_states و chat_messages
 * @param sessionId شناسه جلسه
 * @param assessmentId شناسه ارزیابی
 * @param connection اتصال به دیتابیس
 * @returns آبجکت کامل ConversationState
 */
export async function getConversationState(
    sessionId: string,
    assessmentId: number,
    connection: PoolConnection
): Promise<ConversationState> {
    
    // ۱. اطلاعات اصلی جلسه را از جدول `assessment_states` می‌خوانیم
    const [stateRows]: any = await connection.execute(
        'SELECT * FROM `assessment_states` WHERE `session_id` = ?',
        [sessionId]
    );

    let stateData: Partial<ConversationState> = {};

    if (stateRows.length > 0) {
        // اگر رکوردی برای این جلسه وجود داشت، اطلاعات آن را پارس می‌کنیم
        stateData = JSON.parse(stateRows[0].state_data || '{}');
    } else {
        // اگر جلسه‌ی جدیدی بود، اطلاعات پایه را از پرسشنامه می‌خوانیم
        const [questionnaireRows]: any = await connection.execute(
            'SELECT persona_prompt, persona_name, secondary_persona_prompt, secondary_persona_name, evaluation_criteria FROM `questionnaires` WHERE `id` = ?',
            [assessmentId]
        );
        if (questionnaireRows.length > 0) {
            const q = questionnaireRows[0];
            stateData = {
                personaPrompt: q.persona_prompt,
                personaName: q.persona_name,
                secondaryPersonaPrompt: q.secondary_persona_prompt,
                secondaryPersonaName: q.secondary_persona_name,
                evaluationCriteria: q.evaluation_criteria,
            };
        }
    }

    // ۲. تاریخچه پیام‌ها را از جدول `chat_messages` می‌خوانیم
    const [messageRows]: any = await connection.execute(
        'SELECT `sender_type`, `message_text` FROM `chat_messages` WHERE `session_id` = ? ORDER BY `created_at` ASC',
        [sessionId]
    );

    // ۳. پیام‌ها را به فرمت مورد نیاز برنامه (history array) تبدیل می‌کنیم
    const history: ConversationHistoryMessage[] = messageRows.map((row: any) => ({
        role: row.sender_type === 'user' ? 'user' : 'model',
        parts: [{ text: row.message_text }],
    }));

    // ۴. تمام اطلاعات را در یک آبجکت واحد ترکیب کرده و برمی‌گردانیم
    return {
        sessionId,
        assessmentId,
        history,
        ...stateData, // اعمال اطلاعات خوانده شده از assessment_states
        lastUpdated: new Date(),
    };
}

/**
 * وظیفه: ذخیره وضعیت جدید گفتگو در دو جدول assessment_states و chat_messages
 * @param sessionId شناسه جلسه
 * @param state آبجکت کامل ConversationState که حاوی پیام‌های جدید است
 * @param connection اتصال به دیتابیس
 */
export async function saveConversationState(
    sessionId: string,
    state: ConversationState,
    connection: PoolConnection
): Promise<void> {

    // ۱. ذخیره یا به‌روزرسانی اطلاعات اصلی جلسه در جدول `assessment_states`
    const stateDataToStore = {
        personaPrompt: state.personaPrompt,
        personaName: state.personaName,
        secondaryPersonaPrompt: state.secondaryPersonaPrompt,
        secondaryPersonaName: state.secondaryPersonaName,
        evaluationCriteria: state.evaluationCriteria,
    };

    await connection.execute(
        `INSERT INTO \`assessment_states\` (session_id, assessment_id, state_data, last_updated) 
         VALUES (?, ?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE state_data = ?, last_updated = NOW()`,
        [sessionId, state.assessmentId, JSON.stringify(stateDataToStore), JSON.stringify(stateDataToStore)]
    );

    // ۲. پیدا کردن پیام‌های جدیدی که باید در دیتابیس ذخیره شوند
    const [existingMessages]: any = await connection.execute(
        'SELECT COUNT(*) as count FROM `chat_messages` WHERE `session_id` = ?',
        [sessionId]
    );
    const existingMessageCount = existingMessages[0].count;

    // فقط پیام‌هایی که در دیتابیس نیستند را اضافه می‌کنیم
    const newMessages = state.history.slice(existingMessageCount);

    if (newMessages.length > 0) {
        // ۳. ساخت کوئری برای درج تمام پیام‌های جدید به صورت یکجا
        const query = 'INSERT INTO `chat_messages` (session_id, sender_type, message_text) VALUES ?';
        const values = newMessages.map(msg => [
            sessionId,
            msg.role, // 'user' or 'model'
            msg.parts[0].text
        ]);

        await connection.query(query, [values]);
    }
}
