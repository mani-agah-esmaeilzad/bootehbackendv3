import { authenticateToken } from '@/lib/auth';
import type { NextRequest } from 'next/server';

type TokenSource = 'cookie' | 'header';

export type RawAuthClaims = {
  userId: number;
  username: string;
  role: 'user' | 'admin';
  organizationId: number | null;
};

export type AuthContext = {
  token: string;
  tokenSource: TokenSource;
  claims: RawAuthClaims;
};

const AUTH_COOKIE_NAME = 'authToken';

const parseCookieValue = (cookieHeader: string | null, name: string) => {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split('=');
    if (key && key.trim() === name) {
      return rest.join('=').trim();
    }
  }
  return null;
};

const extractBearerToken = (authorization: string | null) => {
  if (!authorization) return null;
  const normalized = authorization.trim();
  if (!normalized.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return normalized.slice(7).trim() || null;
};

export const getAuthContext = (
  req: Request | NextRequest,
): AuthContext | null => {
  const authorization = req.headers.get('authorization');
  const headerToken = extractBearerToken(authorization);
  const cookieHeader = req.headers.get('cookie');
  const cookieToken = parseCookieValue(cookieHeader, AUTH_COOKIE_NAME);

  const token = headerToken || cookieToken;
  if (!token) {
    return null;
  }

  const claims = authenticateToken(token);
  if (!claims) {
    return null;
  }

  return {
    token,
    tokenSource: headerToken ? 'header' : 'cookie',
    claims: {
      userId: claims.userId,
      username: claims.username,
      role: claims.role,
      organizationId: claims.organizationId ?? null,
    },
  };
};
