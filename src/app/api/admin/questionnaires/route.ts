
// src/app/api/admin/questionnaires/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { QUESTIONNAIRE_CATEGORIES } from '@/constants/questionnaireCategories';

export const dynamic = 'force-dynamic';

const createQuestionnaireSchema = z.object({
    name: z.string().min(1, "نام پرسشنامه نمی‌تواند خالی باشد"),
    description: z.string().optional(),
    welcome_message: z.string().min(1, "پیام خوشامدگویی نمی‌تواند خالی باشد"),
    persona_prompt: z.string().min(1, "پرامپت شخصیت نمی‌تواند خالی باشد"),
    analysis_prompt: z.string().min(1, "پرامپت تحلیل نمی‌تواند خالی باشد"),
    persona_name: z.string().optional(),
    secondary_persona_name: z.string().optional().nullable(),
    secondary_persona_prompt: z.string().optional().nullable(),
    has_narrator: z.boolean().default(false),
    has_timer: z.boolean().default(true),
    timer_duration: z.number().optional().nullable(),
    category: z.enum(QUESTIONNAIRE_CATEGORIES, { errorMap: () => ({ message: "دسته‌بندی انتخاب شده معتبر نیست" }) }),
    next_mystery_slug: z
        .string()
        .trim()
        .regex(/^[a-z0-9-]+$/i, { message: "اسلاگ رازآموزی باید فقط شامل حروف انگلیسی، اعداد و خط تیره باشد." })
        .optional()
        .nullable(),
    enable_second_phase: z.boolean().default(false),
    phase_two_persona_name: z.string().optional().nullable(),
    phase_two_persona_prompt: z.string().optional().nullable(),
    phase_two_analysis_prompt: z.string().optional().nullable(),
    phase_two_welcome_message: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
    if (data.enable_second_phase) {
        if (!data.phase_two_persona_name || data.phase_two_persona_name.trim().length < 2) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phase_two_persona_name'], message: 'نام شخصیت مرحله دوم الزامی است.' });
        }
        if (!data.phase_two_persona_prompt || data.phase_two_persona_prompt.trim().length < 20) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phase_two_persona_prompt'], message: 'پرامپت مرحله دوم باید حداقل ۲۰ کاراکتر باشد.' });
        }
        if (!data.phase_two_analysis_prompt || data.phase_two_analysis_prompt.trim().length < 20) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phase_two_analysis_prompt'], message: 'پرامپت تحلیل مرحله دوم باید حداقل ۲۰ کاراکتر باشد.' });
        }
    }
});

// GET Handler - To fetch all questionnaires
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        // *** FINAL FIX: Using correct column 'name' and aliasing it to 'title' for frontend compatibility ***
        const [rows] = await db.query(
            `SELECT 
                id, 
                name as title, 
                description,
                display_order,
                has_narrator,
                category,
                next_mystery_slug
             FROM questionnaires 
             ORDER BY display_order ASC, id ASC`
        );
        
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error("Get Questionnaires Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}

// POST Handler - To create a new questionnaire
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        const body = await request.json();
        const validation = createQuestionnaireSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ success: false, message: validation.error.errors[0].message }, { status: 400 });
        }

        const {
            name,
            description,
            welcome_message,
            persona_prompt,
            analysis_prompt,
            persona_name,
            secondary_persona_name,
            secondary_persona_prompt,
            has_narrator,
            has_timer,
            timer_duration,
            category,
            next_mystery_slug,
            enable_second_phase,
            phase_two_persona_name,
            phase_two_persona_prompt,
            phase_two_analysis_prompt,
            phase_two_welcome_message
        } = validation.data;

        const [orderResult]: any = await db.query("SELECT MAX(display_order) as max_order FROM questionnaires");
        const newOrder = (orderResult[0].max_order || 0) + 1;
        const totalPhases = enable_second_phase ? 2 : 1;

        const [result]: any = await db.query(
            `INSERT INTO questionnaires (
                name,
                description,
                welcome_message,
                persona_prompt,
                analysis_prompt,
                persona_name,
                secondary_persona_name,
                secondary_persona_prompt,
                has_narrator,
                has_timer,
                timer_duration,
                display_order,
                category,
                next_mystery_slug,
                total_phases,
                phase_two_persona_name,
                phase_two_persona_prompt,
                phase_two_analysis_prompt,
                phase_two_welcome_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                description,
                welcome_message,
                persona_prompt,
                analysis_prompt,
                persona_name,
                secondary_persona_name,
                secondary_persona_prompt,
                has_narrator,
                has_timer,
                timer_duration ?? null,
                newOrder,
                category,
                next_mystery_slug?.trim() || null,
                totalPhases,
                enable_second_phase ? phase_two_persona_name : null,
                enable_second_phase ? phase_two_persona_prompt : null,
                enable_second_phase ? phase_two_analysis_prompt : null,
                enable_second_phase ? phase_two_welcome_message : null
            ]
        );

        return NextResponse.json({ success: true, message: 'پرسشنامه جدید با موفقیت ایجاد شد', data: { id: result.insertId } });

    } catch (error) {
        console.error("Create Questionnaire Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}
