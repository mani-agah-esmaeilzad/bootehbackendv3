import { NextResponse } from 'next/server';

const sampleAssessments = [
  {
    assessmentId: 101,
    questionnaireId: 11,
    questionnaireTitle: 'مهارت‌های ارتباطی پیشرفته',
    category: 'شایستگی های رفتاری (بین فردی)',
    completedAt: '2024-01-02T09:30:00.000Z',
    normalizedScore: 86.5,
    rawScore: 34,
    maxScore: 40,
    summary: 'شما در ایجاد گفتگوهای هدفمند و هدایت جلسات چالشی عملکرد برجسته‌ای دارید.',
    strengths: ['گوش دادن فعال', 'بازخورد سازنده'],
    recommendations: ['تمرین مدیریت تعارض در تیم‌های چندوظیفه‌ای'],
    developmentPlan: ['شرکت در کارگاه «ارتباطات تاثیرگذار»', 'طراحی تقویم بازخورد ماهانه'],
    risks: ['وابستگی زیاد به بازخورد مستقیم'],
    factorScores: [
      { name: 'گوش دادن', score: 4.4, maxScore: 5 },
      { name: 'بیان شفاهی', score: 4.1, maxScore: 5 },
    ],
  },
  {
    assessmentId: 102,
    questionnaireId: 17,
    questionnaireTitle: 'تفکر تحلیلی چندبعدی',
    category: 'شایستگی های شناختی',
    completedAt: '2024-01-03T14:15:00.000Z',
    normalizedScore: 78.25,
    rawScore: 31.3,
    maxScore: 40,
    summary: 'قدرت تحلیل داده و استخراج الگوهای تصمیم‌گیری در شما چشم‌گیر است.',
    strengths: ['ساخت مدل ذهنی', 'تحلیل داده‌های پیچیده'],
    recommendations: ['تدوین سناریوهای جایگزین قبل از تصمیم‌گیری نهایی'],
    developmentPlan: ['مطالعه مطالعه‌ی موردی صنعت فناوری', 'کاربرد تکنیک شش‌کلاه تفکر در پروژه‌های روزمره'],
    risks: ['حساسیت زیاد نسبت به داده‌های ناقص'],
    factorScores: [
      { name: 'حل مسئله', score: 4.0, maxScore: 5 },
      { name: 'نمای کلی', score: 3.8, maxScore: 5 },
    ],
  },
  {
    assessmentId: 103,
    questionnaireId: 19,
    questionnaireTitle: 'رهبری موقعیتی',
    category: 'شایستگی های رهبری و مدیریت',
    completedAt: '2024-01-04T10:45:00.000Z',
    normalizedScore: 90.0,
    rawScore: 36,
    maxScore: 40,
    summary: 'توانایی شما در تطبیق شیوه رهبری با شرایط تیمی مثال‌زدنی است.',
    strengths: ['تفویض مسئولیت مرحله‌ای', 'الهام‌بخشی'],
    recommendations: ['شفاف‌سازی شاخص‌های موفقیت برای تیم‌های جدید'],
    developmentPlan: ['جلسات مربیگری دو هفته یکبار با اعضای کلیدی', 'طراحی KIT رهبری پروژه'],
    risks: ['اتکای بالا به چند نفر خاص در تیم'],
    factorScores: [
      { name: 'مربیگری', score: 4.6, maxScore: 5 },
      { name: 'تصمیم‌گیری', score: 4.3, maxScore: 5 },
    ],
  },
];

const sampleCategories = [
  {
    key: 'category_0',
    label: 'شایستگی های رفتاری (بین فردی)',
    normalizedScore: 86.5,
    completedCount: 1,
    totalAssignments: 1,
    contributions: [
      {
        assessmentId: 101,
        questionnaireId: 11,
        questionnaireTitle: 'مهارت‌های ارتباطی پیشرفته',
        normalizedScore: 86.5,
        rawScore: 34,
        maxScore: 40,
        completedAt: '2024-01-02T09:30:00.000Z',
      },
    ],
  },
  {
    key: 'category_1',
    label: 'شایستگی های شناختی',
    normalizedScore: 78.25,
    completedCount: 1,
    totalAssignments: 1,
    contributions: [
      {
        assessmentId: 102,
        questionnaireId: 17,
        questionnaireTitle: 'تفکر تحلیلی چندبعدی',
        normalizedScore: 78.25,
        rawScore: 31.3,
        maxScore: 40,
        completedAt: '2024-01-03T14:15:00.000Z',
      },
    ],
  },
  {
    key: 'category_2',
    label: 'شایستگی های رهبری و مدیریت',
    normalizedScore: 90,
    completedCount: 1,
    totalAssignments: 1,
    contributions: [
      {
        assessmentId: 103,
        questionnaireId: 19,
        questionnaireTitle: 'رهبری موقعیتی',
        normalizedScore: 90,
        rawScore: 36,
        maxScore: 40,
        completedAt: '2024-01-04T10:45:00.000Z',
      },
    ],
  },
  {
    key: 'category_3',
    label: 'شایستگی های فردی',
    normalizedScore: 62,
    completedCount: 0,
    totalAssignments: 1,
    contributions: [],
  },
  {
    key: 'category_4',
    label: 'شایستگی‌های روانشناختی',
    normalizedScore: 58,
    completedCount: 0,
    totalAssignments: 1,
    contributions: [],
  },
  {
    key: 'category_5',
    label: 'سایر دسته‌بندی‌ها',
    normalizedScore: 0,
    completedCount: 0,
    totalAssignments: 0,
    contributions: [],
  },
];

const samplePowerWheel = sampleCategories.map((entry) => ({
  label: entry.label,
  value: Number(entry.normalizedScore.toFixed(2)),
  status:
    entry.completedCount === 0
      ? 'pending'
      : entry.completedCount < entry.totalAssignments
        ? 'partial'
        : 'completed',
  completedCount: entry.completedCount,
  totalAssignments: entry.totalAssignments,
}));

const sampleData = {
  progress: {
    assignedCount: 5,
    completedCount: 3,
    completionPercent: 60,
    remainingCount: 2,
    isReady: false,
    lastCompletedAt: '2024-01-04T10:45:00.000Z',
  },
  overview: {
    overallScore: 84.25,
    averageScore: 33.77,
  },
  categories: sampleCategories,
  radar: sampleCategories.map((entry) => ({
    subject: entry.label,
    userScore: Number(entry.normalizedScore.toFixed(2)),
    targetScore: 100,
  })),
  powerWheel: samplePowerWheel,
  assessments: sampleAssessments,
  pendingAssignments: [
    {
      user_id: 999,
      questionnaire_id: 21,
      questionnaire_title: 'تاب‌آوری حرفه‌ای',
      display_order: 4,
      category: 'شایستگی های فردی',
      max_score: 40,
    },
    {
      user_id: 999,
      questionnaire_id: 24,
      questionnaire_title: 'پروفایل روانشناختی',
      display_order: 5,
      category: 'شایستگی‌های روانشناختی',
      max_score: 40,
    },
  ],
  strengths: [
    'هدایت رویدادهای بحرانی با آرامش کامل',
    'ایجاد ساختار شفاف برای جلسات تیمی',
    'ارائه بازخوردهای شفاف به همکاران',
  ],
  recommendations: [
    'تعریف معیار سنجش برای پروژه‌های چابک',
    'پیاده‌سازی سیستم مربیگری معکوس در تیم',
  ],
  developmentPlan: [
    'مطالعه کتاب «مربیگری برای عملکرد»',
    'پیگیری برنامه‌ی ۳-۶-۹ ماهه برای تبدیل مهارت‌ها به عادت',
  ],
  risks: ['عدم توازن بار کاری بین اعضای تیم', 'کاهش تمرکز به دلیل پروژه‌های موازی'],
};

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, message: 'این اندپوینت فقط برای محیط توسعه فعال است.' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    mode: 'sample',
    data: sampleData,
  });
}
