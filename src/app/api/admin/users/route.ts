// src/app/api/admin/users/route.ts

import { NextResponse } from 'next/server';
import db from '@/lib/database'; // Corrected import
import { getSession } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session.user || session.user.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });
        }

        // Corrected to use the imported 'db' object
        try {
            const [rows] = await db.query(
                `SELECT id, username, email, first_name, last_name, is_active, created_at 
                 FROM users 
                 ORDER BY created_at DESC`
            );
            return NextResponse.json({ success: true, data: rows });
        } catch (dbError) {
            console.error("Database query error:", dbError);
            throw dbError; // Re-throw to be caught by the outer catch block
        }

    } catch (error) {
        console.error("Get Users Error:", error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}
