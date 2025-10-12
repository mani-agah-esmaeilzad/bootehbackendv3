// src/app/api/auth/logout/route.ts

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    try {
        // حذف کوکی با تنظیم تاریخ انقضا در گذشته
        cookies().set('authToken', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            expires: new Date(0),
        });

        return NextResponse.json({ success: true, message: 'خروج با موفقیت انجام شد' });
    } catch (error) {
        console.error('Logout API Error:', error);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
