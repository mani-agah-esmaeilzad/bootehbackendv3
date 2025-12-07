// src/lib/wordCloud.ts

export interface WordCloudEntry {
  word: string;
  count: number;
}

const ARABIC_CHAR_MAP: Record<string, string> = {
  ي: 'ی',
  ك: 'ک',
  ئ: 'ی',
  ؤ: 'و',
  ء: '',
  هٔ: 'ه',
  ة: 'ه',
};

const normalizeToken = (word: string): string => {
  if (!word) return '';
  let normalized = word
    .replace(/\u200c/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  Object.entries(ARABIC_CHAR_MAP).forEach(([arabicChar, replacement]) => {
    normalized = normalized.split(arabicChar).join(replacement);
  });

  normalized = normalized.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  normalized = normalized.replace(/\d+/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
};

const PERSIAN_STOP_WORDS = new Set(
  [
    'و',
    'در',
    'به',
    'از',
    'که',
    'این',
    'آن',
    'برای',
    'یک',
    'یا',
    'اما',
    'اگر',
    'با',
    'تا',
    'می',
    'من',
    'ما',
    'تو',
    'شما',
    'او',
    'آنها',
    'هست',
    'هستم',
    'هستی',
    'هستیم',
    'هستند',
    'بود',
    'باشم',
    'باشی',
    'باشد',
    'باشیم',
    'باشند',
    'شود',
    'شده',
    'کرد',
    'کنم',
    'کنیم',
    'کنید',
    'شد',
    'حتی',
    'هم',
    'نه',
    'نیز',
    'ولی',
    'چون',
    'چرا',
    'چگونه',
    'چی',
    'چه',
    'چیز',
    'روی',
    'زیر',
    'درباره',
    'همین',
    'خود',
    'خودم',
    'خودت',
    'خودش',
    'اما',
    'البته',
    'بودن',
    'داشت',
    'دارم',
    'دارند',
    'داریم',
    'دارید',
    'باید',
    'نیست',
    'نیستم',
    'نیستی',
    'نیستیم',
    'نیستند',
    'نیاز',
    'کنید',
  ].map((word) => normalizeToken(word)),
);

const tokenizeText = (text: string): string[] => {
  const cleaned = normalizeToken(text);
  if (!cleaned) return [];
  return cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !PERSIAN_STOP_WORDS.has(token));
};

const extractMessageText = (message: any): string => {
  if (!message) return '';
  if (typeof message === 'string') return message;

  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .join(' ');
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : typeof part === 'string' ? part : ''))
      .join(' ');
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (typeof message.message === 'string') {
    return message.message;
  }

  return '';
};

export const buildWordCloudFromHistory = (history: any[], maxItems = 150): WordCloudEntry[] => {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const frequencyMap: Record<string, number> = {};

  history.forEach((message) => {
    const role = typeof message?.role === 'string' ? message.role.toLowerCase() : '';
    const sender = typeof message?.sender_type === 'string' ? message.sender_type.toLowerCase() : '';

    if (role !== 'user' && sender !== 'user') return;

    const text = extractMessageText(message);
    const tokens = tokenizeText(text);

    tokens.forEach((token) => {
      frequencyMap[token] = (frequencyMap[token] || 0) + 1;
    });
  });

  return Object.entries(frequencyMap)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(10, maxItems));
};
