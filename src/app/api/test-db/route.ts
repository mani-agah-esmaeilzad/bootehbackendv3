import { NextResponse } from 'next/server';
import { testConnection, createTables } from '@/lib/database';
import { requireAdmin } from '@/lib/auth/guards';

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  try {
    // تست اتصال
    const isConnected = await testConnection();
    
    if (!isConnected) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'خطا در اتصال به دیتابیس' 
        },
        { status: 500 }
      );
    }

    // ایجاد جداول
    const tablesCreated = await createTables();
    
    if (!tablesCreated) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'خطا در ایجاد جداول' 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'دیتابیس با موفقیت راه‌اندازی شد',
      data: {
        connection: 'OK',
        tables: 'Created'
      }
    });

  } catch (error) {
    console.error('خطا در تست دیتابیس:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'خطای سرور در تست دیتابیس' 
      },
      { status: 500 }
    );
  }
}
