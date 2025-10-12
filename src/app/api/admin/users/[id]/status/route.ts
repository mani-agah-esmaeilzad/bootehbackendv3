// src/app/api/admin/users/[id]/status/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import { z } from 'zod';

const statusUpdateSchema = z.object({
    is_active: z.boolean(),
});

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const token = extractTokenFromHeader(request.headers.get('Authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        }
        
        const decodedToken = authenticateToken(token);

        // *** FIX APPLIED HERE ***
        // Replaced the faulty check with the standard null and role check.
        if (!decodedToken || decodedToken.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز. شما ادمین نیستید.' }, { status: 403 });
        }

        const body = await request.json();
        const validation = statusUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ success: false, message: validation.error.errors[0].message }, { status: 400 });
        }

        const { is_active } = validation.data;
        const userId = parseInt(params.id, 10);

        if (isNaN(userId)) {
            return NextResponse.json({ success: false, message: 'ID کاربر نامعتبر است' }, { status: 400 });
        }

        const [result]: any = await db.query(
            "UPDATE users SET is_active = ? WHERE id = ?",
            [is_active, userId]
        );

        if (result.affectedRows === 0) {
            return NextResponse.json({ success: false, message: 'کاربر یافت نشد' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'وضعیت کاربر با موفقیت بروزرسانی شد' });

    } catch (error) {
        console.error("Update User Status Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}
