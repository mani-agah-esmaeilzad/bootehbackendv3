import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  return NextResponse.json({ success: true, message: 'Backend is running correctly!' });
}
