// src/app/api/admin/questionnaires/[id]/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { QUESTIONNAIRE_CATEGORIES } from '@/constants/questionnaireCategories';

export const dynamic = 'force-dynamic';

// Zod schema for validation, now aligned with the database schema
const questionnaireSchema = z.object({
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

// GET Handler - To fetch a single questionnaire
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        // *** FINAL FIX: Selecting 'name' and aliasing to 'title' for frontend compatibility ***
        const [rows] = await db.query(
            `SELECT 
                id, 
                name as title, 
                description, 
                persona_prompt, 
                analysis_prompt, 
                persona_name, 
                welcome_message,
                secondary_persona_name,
                secondary_persona_prompt,
                has_narrator,
                has_timer,
                timer_duration,
                category,
                next_mystery_slug,
                total_phases,
                phase_two_persona_name,
                phase_two_persona_prompt,
                phase_two_analysis_prompt,
                phase_two_welcome_message
            FROM questionnaires WHERE id = ?`, 
            [params.id]
        );

        const questionnaires = rows as any[];
        if (questionnaires.length === 0) {
            return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: questionnaires[0] });

    } catch (error) {
        console.error("Get Questionnaire Detail Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}

// DELETE Handler
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        const { id } = params;
        const [result]: any = await db.query("DELETE FROM questionnaires WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
        }
        return NextResponse.json({ success: true, message: 'پرسشنامه با موفقیت حذف شد' });

    } catch (error) {
        console.error("Delete Questionnaire Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}

// PUT (Update) Handler
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        const body = await request.json();
        // The frontend sends 'title', so we need to rename it to 'name' for validation
        if (body.title) {
            body.name = body.title;
            delete body.title;
        }

        const validation = questionnaireSchema.safeParse(body);
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
        const { id } = params;
        const totalPhases = enable_second_phase ? 2 : 1;

        // *** FINAL FIX: The UPDATE query now uses the correct column names ***
        const [result]: any = await db.query(
            `UPDATE questionnaires SET 
                name = ?, 
                description = ?, 
                welcome_message = ?,
                persona_prompt = ?, 
                analysis_prompt = ?, 
                persona_name = ?,
                secondary_persona_name = ?,
                secondary_persona_prompt = ?,
                has_narrator = ?,
                has_timer = ?,
                timer_duration = ?,
                category = ?,
                next_mystery_slug = ?,
                total_phases = ?,
                phase_two_persona_name = ?,
                phase_two_persona_prompt = ?,
                phase_two_analysis_prompt = ?,
                phase_two_welcome_message = ?
            WHERE id = ?`,
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
                category,
                next_mystery_slug?.trim() || null,
                totalPhases,
                enable_second_phase ? phase_two_persona_name : null,
                enable_second_phase ? phase_two_persona_prompt : null,
                enable_second_phase ? phase_two_analysis_prompt : null,
                enable_second_phase ? phase_two_welcome_message : null,
                id
            ]
        );

        if (result.affectedRows === 0) {
            return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
        }
        return NextResponse.json({ success: true, message: 'پرسشنامه با موفقیت بروزرسانی شد' });

    } catch (error) {
        console.error("Update Questionnaire Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}
