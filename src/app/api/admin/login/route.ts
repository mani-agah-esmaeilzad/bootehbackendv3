// src/app/api/admin/login/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { verifyPassword, generateToken } from '@/lib/auth';
import { z } from 'zod';
import { cookies } from 'next/headers';

const loginSchema = z.object({
    username: z.string(),
    password: z.string(),
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const validation = loginSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ success: false, message: 'نام کاربری یا رمز عبور نامعتبر است' }, { status: 400 });
        }
        
        const { username, password } = validation.data;

        const [rows]: any = await db.query("SELECT * FROM admins WHERE username = ?", [username]);
        
        if (rows.length === 0) {
            return NextResponse.json({ success: false, message: 'کاربری با این مشخصات یافت نشد' }, { status: 401 });
        }
        const admin = rows[0];

        const isPasswordValid = await verifyPassword(password, admin.password_hash);
        if (!isPasswordValid) {
            return NextResponse.json({ success: false, message: 'کاربری با این مشخصات یافت نشد' }, { status: 401 });
        }

        const token = generateToken(admin.id, admin.username, 'admin');

        // *** FINAL FIX APPLIED HERE: Using the unified cookie name 'authToken' ***
        cookies().set('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 1, // 1 day for admin
        });

        return NextResponse.json({
            success: true,
            message: "ورود با موفقیت انجام شد",
            user: {
                id: admin.id,
                username: admin.username,
                role: 'admin',
            },
        });
    } catch (error) {
        console.error('Admin Login API Error:', error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
