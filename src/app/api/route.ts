// src/app/api/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSession } from '@/lib/auth'; // استفاده از getSession برای احراز هویت امن
import { z } from 'zod';

// Zod schema for validating the incoming answers
const answersSchema = z.record(z.string(), z.number().min(1).max(5));

export async function POST(request: Request) {
    try {
        // احراز هویت امن با استفاده از getSession
        const session = await getSession();
        if (!session.user?.userId) {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 401 });
        }
        const userId = session.user.userId;

        const { answers } = await request.json();

        // اعتبارسنجی پاسخ‌های ورودی
        const validation = answersSchema.safeParse(answers);
        if (!validation.success || Object.keys(answers).length !== 22) {
             return NextResponse.json({ success: false, message: 'داده‌های ارسالی نامعتبر است' }, { status: 400 });
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // ایجاد رکورد در جدول اصلی پرسشنامه
            const [result]: any = await connection.query(
                "INSERT INTO soft_skills_self_assessment (user_id) VALUES (?)",
                [userId]
            );
            const assessmentId = result.insertId;

            // ساخت کوئری برای آپدیت تمام ستون‌های q1 تا q22
            const fieldsToUpdate = Object.keys(answers).map(key => `${key} = ?`).join(', ');
            const values = Object.values(answers);

            await connection.query(
                `UPDATE soft_skills_self_assessment SET ${fieldsToUpdate} WHERE id = ?`,
                [...values, assessmentId]
            );

            await connection.commit();
            
            return NextResponse.json({ 
                success: true, 
                message: 'پاسخ‌های شما با موفقیت ثبت شد.',
                data: { assessmentId }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error("Submit Self-Assessment Error:", error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
