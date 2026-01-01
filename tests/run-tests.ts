import assert from 'node:assert/strict';
import { NextResponse } from 'next/server';
import type { GuardResult } from '@/lib/auth/guards';
import * as guardModule from '@/lib/auth/guards';
import * as authContextModule from '@/lib/auth/getAuthContext';
import pool from '@/lib/database';
import { GET as getAdminUsers } from '@/app/api/admin/users/route';
import { POST as adminLogin } from '@/app/api/admin/login/route';

const nextHeadersShim = require('./shims/next-headers.js');
const authLib = require('@/lib/auth');
type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const tests: TestCase[] = [];

tests.push({
  name: 'requireAdmin denies non-admin users',
  run: async () => {
    const originalGetAuthContext = authContextModule.getAuthContext;
    const originalQuery = (pool as any).query;

    (authContextModule as any).getAuthContext = () => ({
      token: 'test-token',
      tokenSource: 'header',
      claims: {
        userId: 42,
        username: 'standard-user',
        role: 'user',
        organizationId: null,
      },
    });

    (pool as any).query = async (sql: string) => {
      if (sql.includes('FROM users')) {
        return [[{ id: 42, is_active: 1 }], []];
      }
      return [[{ id: 1 }], []];
    };

    const result = await guardModule.requireAdmin(new Request('http://localhost/api/admin/example'));
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 403);

    (authContextModule as any).getAuthContext = originalGetAuthContext;
    (pool as any).query = originalQuery;
  },
});

tests.push({
  name: 'admin users route rejects unauthenticated requests',
  run: async () => {
    const originalRequireAdmin = guardModule.requireAdmin;
    (guardModule as any).requireAdmin = async () =>
      ({
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'UNAUTHENTICATED', message: 'Unauthenticated' },
          { status: 401 },
        ),
      }) as GuardResult;

    const response = await getAdminUsers(new Request('http://localhost/api/admin/users'));
    assert.equal(response.status, 401);

    (guardModule as any).requireAdmin = originalRequireAdmin;
  },
});

tests.push({
  name: 'admin users route rejects non-admin requests',
  run: async () => {
    const originalRequireAdmin = guardModule.requireAdmin;
    (guardModule as any).requireAdmin = async () =>
      ({
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'FORBIDDEN', message: 'Forbidden' },
          { status: 403 },
        ),
      }) as GuardResult;

    const response = await getAdminUsers(new Request('http://localhost/api/admin/users'));
    assert.equal(response.status, 403);

    (guardModule as any).requireAdmin = originalRequireAdmin;
  },
});
tests.push({
  name: 'admin cookie-only flow succeeds for admin endpoint',
  run: async () => {
    const originalQuery = (pool as any).query;
    const originalVerifyPassword = authLib.verifyPassword;

    (authLib as any).verifyPassword = async () => true;

    (pool as any).query = async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM admins WHERE username')) {
        return [[{ id: 1, username: 'admin', password_hash: 'hash' }], []];
      }
      if (typeof sql === 'string' && sql.includes('FROM admins WHERE id')) {
        return [[{ id: 1 }], []];
      }
      if (typeof sql === 'string' && sql.includes('FROM users WHERE id = ?')) {
        return [[{ id: 1, is_active: 1 }], []];
      }
      if (typeof sql === 'string' && sql.includes('SELECT id, username, email, first_name, last_name, is_active, created_at')) {
        return [[{ id: 2, username: 'user', email: 'user@example.com', first_name: 'Test', last_name: 'User', is_active: 1, created_at: new Date().toISOString() }], []];
      }
      return [[], []];
    };

    nextHeadersShim.__cookieStore.clear();

    const loginResponse = await adminLogin(
      new Request('http://localhost/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'secret' }),
      }),
    );
    assert.equal(loginResponse.status, 200);

    const cookieEntry = nextHeadersShim.__cookieStore.get('authToken');
    assert.ok(cookieEntry && cookieEntry.value, 'authToken cookie must be set');

    const usersResponse = await getAdminUsers(
      new Request('http://localhost/api/admin/users', {
        headers: { cookie: `authToken=${cookieEntry.value}` },
      }),
    );
    assert.equal(usersResponse.status, 200);

    nextHeadersShim.__cookieStore.clear();
    (pool as any).query = originalQuery;
    (authLib as any).verifyPassword = originalVerifyPassword;
  },
});


const run = async () => {
  for (const test of tests) {
    await test.run();
    console.log(`✔ ${test.name}`);
  }
  console.log('Security baseline tests passed.');
};

run().catch((error) => {
  console.error('Test run failed:', error);
  process.exit(1);
});
