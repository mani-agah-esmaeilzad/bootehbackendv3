import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import pool from '@/lib/database';
import { getAuthContext, type AuthContext } from '@/lib/auth/getAuthContext';
import type { RowDataPacket } from 'mysql2';

type RequestLike = Request | NextRequest;

type GuardFailure = {
  ok: false;
  response: NextResponse;
};

type GuardSuccess<TContext extends AuthContext = AuthContext> = {
  ok: true;
  context: TContext;
};

export type GuardResult<TContext extends AuthContext = AuthContext> =
  | GuardFailure
  | GuardSuccess<TContext>;

const buildErrorResponse = (status: number, error: string, message: string) =>
  NextResponse.json({ success: false, error, message }, { status });

const unauthorized = () =>
  buildErrorResponse(401, 'UNAUTHENTICATED', 'Unauthenticated');

const forbidden = () =>
  buildErrorResponse(403, 'FORBIDDEN', 'Forbidden');

const getUserRecord = async (userId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, is_active FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  if (!rows.length) {
    return null;
  }
  return rows[0];
};

const adminExists = async (adminId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM admins WHERE id = ? LIMIT 1',
    [adminId],
  );
  return rows.length > 0;
};

const resolveOrganizationId = async (
  identifier: string | number,
): Promise<number | null> => {
  if (typeof identifier === 'number' && Number.isInteger(identifier)) {
    return identifier;
  }

  if (typeof identifier === 'string' && /^\d+$/.test(identifier)) {
    return parseInt(identifier, 10);
  }

  if (typeof identifier === 'string') {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM organizations WHERE slug = ? LIMIT 1',
      [identifier],
    );
    if (rows.length) {
      return rows[0].id as number;
    }
  }

  return null;
};

const isOrgMember = async (userId: number, organizationId: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT user_id FROM organization_users WHERE user_id = ? AND organization_id = ? LIMIT 1',
    [userId, organizationId],
  );
  return rows.length > 0;
};

export const requireAuth = async (
  req: RequestLike,
): Promise<GuardResult<AuthContext>> => {
  const context = getAuthContext(req);
  if (!context) {
    return { ok: false, response: unauthorized() };
  }

  if (context.claims.role === 'admin') {
    const exists = await adminExists(context.claims.userId);
    if (!exists) {
      return { ok: false, response: unauthorized() };
    }
    return { ok: true, context };
  }

  const user = await getUserRecord(context.claims.userId);
  if (!user || user.is_active === 0) {
    return { ok: false, response: unauthorized() };
  }

  return { ok: true, context };
};

export const requireAdmin = async (
  req: RequestLike,
): Promise<GuardResult<AuthContext>> => {
  const authResult = await requireAuth(req);
  if (!authResult.ok) {
    return authResult;
  }
  if (authResult.context.claims.role !== 'admin') {
    return { ok: false, response: forbidden() };
  }
  return authResult;
};

export const requireOrgMember = async (
  req: RequestLike,
  orgIdentifier: number | string,
): Promise<GuardResult<AuthContext>> => {
  const authResult = await requireAuth(req);
  if (!authResult.ok) {
    return authResult;
  }

  if (authResult.context.claims.role === 'admin') {
    return authResult;
  }

  const organizationId = await resolveOrganizationId(orgIdentifier);
  if (!organizationId) {
    return { ok: false, response: forbidden() };
  }

  const member = await isOrgMember(
    authResult.context.claims.userId,
    organizationId,
  );

  if (!member) {
    return { ok: false, response: forbidden() };
  }

  return authResult;
};
