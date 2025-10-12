// src/app/api/auth/login/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { verifyPassword, generateToken } from '@/lib/auth';
import { z } from 'zod';
import { cookies } from 'next/headers';

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const validation = loginSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ success: false, message: 'ایمیل یا رمز عبور نامعتبر است' }, { status: 400 });
        }
        const { email, password } = validation.data;
        
        console.log(`Attempting login for email: ${email}`);

        const [rows]: any = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        if (rows.length === 0) {
            console.log(`DEBUG: User with email ${email} not found.`);
            return NextResponse.json({ success: false, message: 'کاربری با این مشخصات یافت نشد' }, { status: 401 });
        }
        const user = rows[0];

        if (!user.is_active) {
            console.log(`DEBUG: User ${email} is inactive.`);
            return NextResponse.json({ success: false, message: 'حساب کاربری شما غیرفعال است' }, { status: 403 });
        }

        // --- DEBUGGING LOGS ---
        console.log(`DEBUG: Hashed password from DB for ${email}:`, user.password_hash);
        const isPasswordValid = await verifyPassword(password, user.password_hash);
        console.log(`DEBUG: Password verification result for ${email}: ${isPasswordValid}`);
        // --- END DEBUGGING LOGS ---

        if (!isPasswordValid) {
            return NextResponse.json({ success: false, message: 'کاربری با این مشخصات یافت نشد' }, { status: 401 });
        }

        const token = generateToken(user.id, user.username, user.role, user.organization_id);

        cookies().set('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
        });

        return NextResponse.json({
            success: true,
            message: "ورود با موفقیت انجام شد",
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Login API Error:', error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
