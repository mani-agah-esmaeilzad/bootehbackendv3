// src/app/api/auth/register/route.ts

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/database";
import { z } from "zod";

// Zod schema updated to remove organizationId and match the database
const registerSchema = z.object({
  email: z.string().email({ message: "ایمیل نامعتبر است" }),
  password: z
    .string()
    .min(6, { message: "رمز عبور باید حداقل ۶ کاراکتر باشد" }),
  firstName: z.string().min(1, { message: "نام نمی‌تواند خالی باشد" }),
  lastName: z.string().min(1, { message: "نام خانوادگی نمی‌تواند خالی باشد" }),
  // organizationId is completely removed
  phoneNumber: z.string().optional(),
  age: z.number().optional(),
  educationLevel: z.string().optional(),
  workExperience: z.string().optional(),
});

// تابعی برای ساختن یک نام کاربری منحصر به فرد
async function createUniqueUsername(email: string): Promise<string> {
  let username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (username.length < 3) username = `user_${username}`;
  let isUnique = false;
  let counter = 0;
  let finalUsername = username;

  while (!isUnique) {
    const [existingUsers] = await db.query(
      "SELECT id FROM users WHERE username = ?",
      [finalUsername]
    );

    if (Array.isArray(existingUsers) && existingUsers.length === 0) {
      isUnique = true;
    } else {
      counter++;
      finalUsername = `${username}${counter}`;
    }
  }
  return finalUsername;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: validation.error.errors[0].message },
        { status: 400 }
      );
    }
    
    const { 
        email, password, firstName, lastName,
        phoneNumber, age, educationLevel, workExperience 
    } = validation.data;

    const [existingEmail] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (Array.isArray(existingEmail) && existingEmail.length > 0) {
      return NextResponse.json(
        { success: false, message: "کاربری با این ایمیل قبلاً ثبت‌نام کرده است" },
        { status: 409 }
      );
    }
    
    const username = await createUniqueUsername(email);
    const hashedPassword = await bcrypt.hash(password, 10);

    // *** FINAL FIX APPLIED HERE ***
    // The INSERT statement is now perfectly aligned with your table structure.
    // organization_id has been removed.
    const [result] = await db.query(
      `INSERT INTO users (
        username, email, password_hash, first_name, last_name,
        phone_number, age, education_level, work_experience
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        email,
        hashedPassword,
        firstName,
        lastName,
        phoneNumber ?? null,
        age ?? null,
        educationLevel ?? null,
        workExperience ?? null
      ]
    );

    const insertResult = result as any;
    if (insertResult.affectedRows === 0) {
      throw new Error("خطا در ایجاد کاربر جدید");
    }

    const newUser = {
      id: insertResult.insertId,
      username,
      email,
      firstName,
      lastName,
    };

    return NextResponse.json({
      success: true,
      message: "ثبت‌نام با موفقیت انجام شد",
      user: newUser,
    });
  } catch (error) {
    console.error("Register API Error:", error);
    return NextResponse.json(
      { success: false, message: "خطایی در سرور رخ داد" },
      { status: 500 }
    );
  }
}
