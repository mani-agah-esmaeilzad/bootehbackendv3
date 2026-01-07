import { NextResponse } from 'next/server';
import { mockFinalReport } from '@/data/mockAssessment';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, message: 'این اندپوینت فقط برای محیط توسعه فعال است.' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    mode: 'sample',
    data: mockFinalReport.data,
  });
}
