import { NextResponse } from 'next/server';
import { swaggerDocument } from '@/lib/swagger';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(swaggerDocument);
}
