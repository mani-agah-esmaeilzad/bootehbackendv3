// src/lib/chartModules.ts

export type ChartModuleType =
  | 'factor_metrics'
  | 'sentiment_profile'
  | 'keyword_focus'
  | 'verbosity_trend'
  | 'action_profile'
  | 'problem_solving_profile'
  | 'communication_profile'
  | 'semantic_fields'
  | 'linguistic_axes'
  | 'pronoun_usage'
  | 'confidence_index'
  | 'readiness_index'
  | 'progress_timeline';

export interface ChartModuleItem {
  key: string;
  label: string;
  maxScore?: number;
  category?: string;
  description?: string;
}

export interface ChartModuleConfig {
  id?: string;
  type: ChartModuleType;
  title?: string;
  enabled?: boolean;
  items?: ChartModuleItem[];
  settings?: Record<string, any>;
}

const formatItemsList = (items: ChartModuleItem[] | undefined) => {
  if (!items || items.length === 0) return '⦁ (هیچ مولفه‌ای تعریف نشده است؛ در این حالت خروجی خالی نخواهد بود.)';
  return items
    .map(
      (item, index) =>
        `${index + 1}. "${item.label}" با کلید ${item.key}${
          item.maxScore ? ` (حداکثر ${item.maxScore})` : ''
        }${item.category ? ` | دسته: ${item.category}` : ''}`,
    )
    .join('\n');
};

const builders: Record<ChartModuleType, (module: ChartModuleConfig) => string> = {
  factor_metrics: (module) => {
    const itemsDescription = formatItemsList(module.items);
    return `- برای نمودارهای عنکبوتی، مقایسه‌ای و پاورویل، کلیدی با نام "factor_scores" نیاز است. در این کلید، آرایه‌ای از اشیا با فیلدهای { "subject": <عنوان فارسی>, "score": <عدد>, "maxScore": <حداکثر>, "category": <اختیاری> } بازگردان.
${itemsDescription}
- همین داده‌ها باید برای کلیدهای "factor_scatter" و "factor_contribution" نیز استفاده شود (در scatter فیلد "fullMark" برابر با maxScore و در contribution فیلد "score" سهم درصدی از ۱ تا ۱۰۰ است).
- برای پاورویل، کلیدی با نام "power_wheel.dimensions" شامل آرایه‌ای از { "dimension": <عنوان>, "category": <دسته>, "score": <۰ تا ۱۰۰> } ایجاد کن.`;
  },
  sentiment_profile: (module) => {
    const categories = module.items && module.items.length > 0 ? formatItemsList(module.items) : `1. "مثبت"\n2. "منفی"\n3. "خنثی"`;
    return `- کلید "sentiment_analysis" باید یک آبجکت شمارشی از احساسات زیر باشد (مقادیر اعدادی بین ۰ تا ۱۰۰):
${categories}`;
  },
  keyword_focus: (module) => {
    const keywords = formatItemsList(module.items);
    return `- کلید "keyword_analysis" باید آرایه‌ای از { "keyword": <عبارت>, "mentions": <تعداد وقوع واقعی در گفتگو> } برای عبارات زیر باشد:
${keywords}`;
  },
  verbosity_trend: () =>
    `- کلید "verbosity_trend" باید آرایه‌ای از { "turn": <شماره نوبت>, "word_count": <تعداد واژه‌ها در همان نوبت> } باشد تا نمودار روند حجم پاسخ رسم شود.`,
  action_profile: (module) => {
    const activeLabel = module.settings?.activeLabel || 'واژگان کنشی';
    const passiveLabel = module.settings?.passiveLabel || 'واژگان غیرکنشی';
    return `- کلید "action_orientation" باید یک آبجکت شامل دو فیلد باشد:
  • "action_words": تعداد ${activeLabel}
  • "passive_words": تعداد ${passiveLabel}`;
  },
  problem_solving_profile: (module) => {
    const metrics = formatItemsList(module.items);
    return `- کلید "problem_solving_approach" باید یک آبجکت باشد که برای هر مولفه زیر عددی بین ۰ تا حداکثر امتیاز مشخص کند:
${metrics}`;
  },
  communication_profile: (module) => {
    const metrics = formatItemsList(module.items);
    return `- کلید "communication_style" باید یک آبجکت با فیلدهای زیر (مقادیر ۰ تا ۱۰) باشد:
${metrics}`;
  },
  semantic_fields: (module) => {
    const metrics = formatItemsList(module.items);
    return `- در "linguistic_semantic_analysis.semantic_fields" آرایه‌ای از { "field": <عنوان>, "mentions": <تعداد> } بساز و حوزه‌های زیر را با اعداد واقعی گزارش کن:
${metrics}`;
  },
  linguistic_axes: (module) => {
    const axes =
      module.items && module.items.length > 0
        ? module.items.map((item) => `${item.key}: مقدار ${item.label}`).join('\n')
        : `lexical_diversity، semantic_coherence، concreteness_level، abstractness_level`;
    return `- در کلید "linguistic_semantic_analysis" مقادیر شاخص‌های زیر را (در بازه ۰ تا ۱ یا ۱ تا ۵ بسته به نوع شاخص) ثبت کن:
${axes}`;
  },
  pronoun_usage: () =>
    `- در "linguistic_semantic_analysis.pronoun_usage" تعداد استفاده از ضمایر اول/دوم/سوم شخص را گزارش کن؛ ساختار نمونه: { "first_person": 12, "second_person": 5, "third_person": 6 }.`,
  confidence_index: () =>
    `- کلید "confidence_level" باید آبجکتی شامل { "score": عددی از ۰ تا ۱۰, "comment": توضیح کوتاه فارسی } باشد تا شاخص اطمینان رسم شود.`,
  readiness_index: () =>
    `- کلید "readiness_index" یا "readiness_score" باید عددی از ۰ تا ۱۰۰ باشد که آمادگی کلی گزارش را نمایش دهد.`,
  progress_timeline: () =>
    `- کلید "progress_timeline" باید آرایه‌ای از { "iteration": <شماره مرحله> , "score": <عملکرد یا امتیاز همان مرحله> } برای رسم نمودار پراکندگی پیشرفت باشد.`,
};

const parseModulesInput = (modulesInput: string | ChartModuleConfig[] | null | undefined): ChartModuleConfig[] => {
  if (!modulesInput) return [];
  if (Array.isArray(modulesInput)) return modulesInput;
  if (typeof modulesInput === 'string') {
    try {
      const parsed = JSON.parse(modulesInput);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const composeAnalysisPrompt = (
  basePrompt: string | null | undefined,
  modulesInput: string | ChartModuleConfig[] | null | undefined,
): string => {
  const modules = parseModulesInput(modulesInput)
    .map((module, index) => ({
      ...module,
      enabled: module.enabled !== false,
      type: module.type as ChartModuleType,
      id: module.id || `${module.type}-${index + 1}`,
    }))
    .filter((module) => module.enabled);

  if (!modules.length) {
    return basePrompt || '';
  }

  const instructions = modules
    .map((module) => {
      const builder = builders[module.type];
      if (!builder) return '';
      return builder(module);
    })
    .filter((text) => text && text.trim().length > 0)
    .join('\n\n');

  if (!instructions) {
    return basePrompt || '';
  }

  const trimmedBase = (basePrompt || '').trim();
  return `${trimmedBase}

## الزامات ساختار داده برای داشبورد
${instructions}

- تمام بخش‌ها باید در خروجی JSON نهایی حضور داشته باشند و در صورت نبود داده، مقدار عددی صفر قرار داده شود.
- کلیدها باید دقیقاً مطابق نام‌های ذکر شده باشند.
`;
};
