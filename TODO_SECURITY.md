## Remaining Security Work

1. **Middleware Protection**
   - Add middleware-based enforcement for `/admin/*` pages and `/api/admin/*` routes (defense in depth, redirects/JSON errors).
2. **Rate Limiting**
   - Implement reusable rate limiter utility and apply to login/register/org-login, destructive admin routes, uploads, and chat endpoints.
3. **CSRF Defense**
   - Introduce double-submit cookie helper, set/read `csrfToken`, and require `x-csrf-token` for cookie-auth state-changing requests.
4. **CORS Hardening**
   - Implement env-driven CORS helper that restricts origins (no wildcard with credentials) and handle OPTIONS requests consistently.
5. **Org Login Improvements**
   - Add throttling and optional secure cookie handling for org login while keeping JSON response compatibility.
6. **Audit Logging**
   - Add structured audit logs for destructive admin operations (userId, action, target, ip, user-agent).
7. **Documentation Updates**
   - Produce SECURITY.md coverage for auth flows, RBAC, rate limits, CSRF, CORS, and debug endpoint behavior once above items are complete.
