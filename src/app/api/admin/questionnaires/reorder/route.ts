// src/app/api/admin/questionnaires/reorder/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import { z } from 'zod';

const reorderSchema = z.array(z.object({
    id: z.number(),
    display_order: z.number(),
}));

export async function POST(request: Request) {
    try {
        const token = extractTokenFromHeader(request.headers.get('Authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        }

        const decodedToken = authenticateToken(token);

        // *** FIX APPLIED HERE ***
        // Replaced the incorrect type assertion with a standard null and role check.
        if (!decodedToken || decodedToken.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        const body = await request.json();
        const validation = reorderSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ success: false, message: 'داده‌های ارسالی نامعتبر است' }, { status: 400 });
        }

        const questionnaires = validation.data;

        // Use a transaction to ensure all updates succeed or none do
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            for (const q of questionnaires) {
                await connection.query(
                    "UPDATE questionnaires SET display_order = ? WHERE id = ?",
                    [q.display_order, q.id]
                );
            }
            await connection.commit();
            connection.release();
            return NextResponse.json({ success: true, message: 'ترتیب پرسشنامه‌ها با موفقیت بروزرسانی شد' });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error; // Re-throw to be caught by the outer catch block
        }

    } catch (error) {
        console.error("Reorder Questionnaires Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}
