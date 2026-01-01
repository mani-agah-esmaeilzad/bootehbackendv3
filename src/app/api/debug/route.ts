import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';

const handleEnvRestriction = async (request: NextRequest) => {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  return null;
};

export async function GET(request: NextRequest) {
  const blocked = await handleEnvRestriction(request);
  if (blocked) {
    return blocked;
  }
  return NextResponse.json({
    message: 'Debug API is working',
    timestamp: new Date().toISOString(),
    success: true
  });
}

export async function POST(request: NextRequest) {
  const blocked = await handleEnvRestriction(request);
  if (blocked) {
    return blocked;
  }
  try {
    const body = await request.json();
    return NextResponse.json({
      message: 'POST request received',
      data: body,
      timestamp: new Date().toISOString(),
      success: true
    });
  } catch (error) {
    return NextResponse.json({
      message: 'Error processing request',
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }, { status: 400 });
  }
}
