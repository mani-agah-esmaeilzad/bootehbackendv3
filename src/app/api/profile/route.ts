import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';
import { requireAuth } from '@/lib/auth/guards';

type UserProfileRow = RowDataPacket & {
  id: number;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  age: number | null;
  educationLevel: string | null;
  workExperience: string | null;
  gender: string | null;
  role: 'user' | 'admin';
  isActive: number | boolean;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const userId = guard.context.claims.userId;

    const [rows] = await pool.query<UserProfileRow[]>(
      `SELECT 
        id,
        username,
        email,
        first_name AS firstName,
        last_name AS lastName,
        phone_number AS phoneNumber,
        age,
        education_level AS educationLevel,
        work_experience AS workExperience,
        gender,
        role,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE id = ?
      LIMIT 1`,
      [userId],
    );

    if (!rows.length) {
      return NextResponse.json(
        {
          success: false,
          message: 'کاربر یافت نشد',
        },
        { status: 404 },
      );
    }

    const user = rows[0];
    const profile = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      age: user.age,
      educationLevel: user.educationLevel,
      workExperience: user.workExperience,
      gender: user.gender,
      role: user.role,
      isActive: Boolean(user.isActive),
      createdAt: user.createdAt
        ? new Date(user.createdAt).toISOString()
        : null,
      updatedAt: user.updatedAt
        ? new Date(user.updatedAt).toISOString()
        : null,
    };

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Profile API error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'خطای داخلی سرور',
      },
      { status: 500 },
    );
  }
}
