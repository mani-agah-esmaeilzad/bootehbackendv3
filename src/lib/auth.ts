// src/lib/auth.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// --- TYPE DEFINITIONS ---
interface UserPayload {
  userId: number;
  username: string;
  role: 'user' | 'admin';
  organizationId: number | null;
  iat: number;
  exp: number;
}


// --- CORE FUNCTIONS ---

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateToken = (
  userId: number, 
  username: string, 
  role: 'user' | 'admin' = 'user', 
  organizationId: number | null = null,
  expiresInSeconds: number = 7 * 24 * 60 * 60 // 7 days
) => {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;

  const payload: Omit<UserPayload, 'iat' | 'exp'> = { 
    userId, 
    username, 
    role,
    organizationId,
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSeconds });
};

export const authenticateToken = (token: string): UserPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch (error) {
    return null; 
  }
};

// *** تابع جدید که اضافه شد ***
/**
 * @description Extracts token from cookies or Authorization header and returns user session.
 * This is the primary function to get user info in API routes.
 */
export const getSession = async (): Promise<{ user: Omit<UserPayload, 'iat' | 'exp'> | null }> => {
  const cookieStore = cookies();
  try {
    const cookieNames = cookieStore.getAll().map((cookie) => cookie.name);
    console.log('Auth Debug - incoming cookies:', cookieNames);
  } catch (error) {
    console.log('Auth Debug - failed to read cookies:', error);
  }
  const token = cookieStore.get('authToken')?.value;

  if (!token) {
    console.log('Auth Debug - authToken cookie missing on request');
    return { user: null };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    console.log('Auth Debug - token decoded for user:', decoded.userId);
    return { 
        user: {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            organizationId: decoded.organizationId
        }
    };
  } catch (error) {
    // If token is invalid or expired
    console.log('Auth Debug - token verification failed:', error);
    return { user: null };
  }
};


// --- UTILITY FUNCTIONS ---

export const extractTokenFromHeader = (header: string | null | undefined): string | null => {
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.substring(7);
};

export const verifyAdmin = async (req: NextRequest) => {
  const token = extractTokenFromHeader(req.headers.get('Authorization'));
  if (!token) return { admin: null, error: 'توکن احراز هویت ارسال نشده است' };
  
  const decoded = authenticateToken(token);
  if (!decoded || decoded.role !== 'admin') {
    return { admin: null, error: 'دسترسی غیرمجاز. شما ادمین نیستید.' };
  }
  
  return { admin: decoded, error: null };
};
