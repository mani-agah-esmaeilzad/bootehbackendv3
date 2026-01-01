type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

const methodLabels: Record<HttpMethod, { summary: string; description: string }> = {
  GET: { summary: 'Fetch', description: 'fetching' },
  POST: { summary: 'Submit', description: 'submitting' },
  PUT: { summary: 'Update', description: 'updating' },
  DELETE: { summary: 'Remove', description: 'removing' },
  PATCH: { summary: 'Patch', description: 'partially updating' },
};


const methodsRequiringBody: HttpMethod[] = ['POST', 'PUT', 'PATCH'];

const buildJsonRequestBody = (
  schema: Record<string, unknown>,
  example?: Record<string, unknown>,
  required = true,
) => ({
  required,
  content: {
    'application/json': {
      schema,
      example,
    },
  },
});

const defaultRequestBody = buildJsonRequestBody({
  type: 'object',
  description: 'Generic JSON payload; inspect the endpoint implementation for exact fields.',
  additionalProperties: true,
});

const buildMultipartRequestBody = (schema: Record<string, unknown>, required = true) => ({
  required,
  content: {
    'multipart/form-data': {
      schema,
    },
  },
});

const pathMethods = {
  '/': ['POST'],
  '/admin/assessment/preview-chat': ['POST'],
  '/admin/assessment/preview/{id}': ['GET'],
  '/admin/assessments': ['DELETE'],
  '/admin/assessments/{questionnaireId}': ['POST'],
  '/admin/blog': ['GET', 'POST'],
  '/admin/blog/{id}': ['DELETE', 'PUT'],
  '/admin/blog/images/upload': ['POST'],
  '/admin/export/group': ['POST'],
  '/admin/export/user/{userId}': ['GET'],
  '/admin/final-reports': ['GET'],
  '/admin/final-reports/{id}': ['GET'],
  '/admin/hash-password': ['GET'],
  '/admin/login': ['POST'],
  '/admin/mystery': ['GET', 'POST'],
  '/admin/mystery/{id}': ['DELETE', 'PUT'],
  '/admin/mystery/images/generate-text': ['POST'],
  '/admin/mystery/images/upload': ['POST'],
  '/admin/organizations': ['GET', 'POST'],
  '/admin/organizations/{id}': ['DELETE', 'GET', 'PUT'],
  '/admin/personality-tests': ['GET', 'POST'],
  '/admin/personality-tests/{id}': ['DELETE', 'GET', 'PUT'],
  '/admin/personality-tests/results': ['GET'],
  '/admin/questionnaires': ['GET', 'POST'],
  '/admin/questionnaires/{id}': ['DELETE', 'GET', 'PUT'],
  '/admin/questionnaires/{id}/status': ['PUT'],
  '/admin/questionnaires/reorder': ['POST'],
  '/admin/reports': ['GET'],
  '/admin/reports-overview': ['GET'],
  '/admin/reports/{id}': ['DELETE', 'GET'],
  '/admin/user-stages': ['GET'],
  '/admin/user-stages/{id}': ['GET', 'PUT'],
  '/admin/users': ['GET'],
  '/admin/users/{id}': ['DELETE', 'GET'],
  '/admin/users/{id}/status': ['PUT'],
  '/admin/users/bulk-upload': ['POST'],
  '/assessment/chat/{id}': ['POST'],
  '/assessment/final-report': ['GET'],
  '/assessment/finish/{id}': ['POST'],
  '/assessment/results': ['GET'],
  '/assessment/results/{id}': ['GET'],
  '/assessment/start/{id}': ['POST'],
  '/assessment/status': ['GET'],
  '/assessment/supplementary/{id}': ['POST'],
  '/assessment/tts': ['POST'],
  '/auth/login': ['POST'],
  '/auth/logout': ['POST'],
  '/auth/register': ['POST'],
  '/blog': ['GET'],
  '/blog/{slug}': ['GET'],
  '/database/rebuild': ['POST'],
  '/debug': ['GET', 'POST'],
  '/debug-chat': ['GET', 'POST'],
  '/health': ['GET'],
  '/mystery': ['GET'],
  '/mystery/{slug}': ['GET'],
  '/mystery/chat/{sessionId}': ['POST'],
  '/mystery/finish/{sessionId}': ['POST'],
  '/mystery/start/{slug}': ['POST'],
  '/org/{slug}': ['GET'],
  '/org/{slug}/login': ['POST'],
  '/personality-tests': ['GET'],
  '/personality-tests/{slug}': ['GET'],
  '/personality-tests/{slug}/register': ['POST'],
  '/personality/chat/{sessionId}': ['POST'],
  '/personality/finish/{sessionId}': ['POST'],
  '/personality/form/{slug}/start': ['POST'],
  '/personality/form/finish/{sessionId}': ['POST'],
  '/personality/results': ['GET'],
  '/personality/results/{sessionId}': ['GET'],
  '/personality/start/{slug}': ['POST'],
  '/test': ['GET'],
  '/test-db': ['GET'],
  '/uploads/blog/{slug}': ['GET'],
} satisfies Record<string, HttpMethod[]>;

const parameterDescriptions: Record<string, string> = {
  id: 'Unique identifier for the entity.',
  slug: 'Slug that identifies the requested resource.',
  userId: 'Unique user identifier.',
  questionnaireId: 'Questionnaire identifier.',
  sessionId: 'Identifier of the active session.',
};

const pathTagOverrides: Record<string, string> = {
  '/': 'Assessment',
  '/debug': 'Diagnostics',
  '/debug-chat': 'Diagnostics',
  '/test': 'Diagnostics',
  '/test-db': 'Diagnostics',
};

const tagDescriptions: Record<string, string> = {
  Admin: 'Administrative access to content, questionnaires, and exports.',
  Assessment: 'Assessment lifecycle, chat, reports, and supplementary content.',
  Auth: 'Public authentication endpoints for end-users.',
  Blog: 'Public blog listing and article retrieval.',
  Core: 'General-purpose helpers exposed by the API.',
  Database: 'Maintenance operations for database management.',
  Diagnostics: 'Internal testing and debug utilities.',
  Health: 'Service health-check endpoints.',
  Mystery: 'Mystery experience management and gameplay APIs.',
  Org: 'White-label organization data and authentication.',
  Personality: 'Runtime APIs for the personality test experience.',
  'Personality Tests': 'Catalog data for available personality questionnaires.',
  Uploads: 'Serving uploaded static assets.',
};

type OperationOverride = {
  summary?: string;
  description?: string;
  requestBody?: Record<string, unknown> | null;
};

const operationOverrides: Partial<Record<string, Partial<Record<HttpMethod, OperationOverride>>>> = {
  '/': {
    POST: {
      summary: 'Submit self-assessment answers',
      description: 'Stores the 22-question soft-skills self-assessment answers for the authenticated user.',
    },
  },
  '/admin/login': {
    POST: {
      summary: 'Admin login',
      description: 'Validates administrator credentials and issues an auth cookie for the dashboard.',
      requestBody: buildJsonRequestBody(
        {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string', format: 'password' },
          },
          additionalProperties: false,
        },
        { username: 'admin', password: 'P@ssw0rd!' },
      ),
    },
  },
  '/admin/users/bulk-upload': {
    POST: {
      summary: 'Bulk import users',
      description: 'Accepts CSV uploads containing user data for batch creation.',
      requestBody: buildMultipartRequestBody({
        type: 'object',
        required: ['file'],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'XLSX or CSV file with user information columns.',
          },
        },
      }),
    },
  },
  '/admin/mystery/images/upload': {
    POST: {
      summary: 'Upload mystery assets',
      description: 'Uploads background images that are used inside the mystery storyline.',
      requestBody: buildMultipartRequestBody({
        type: 'object',
        required: ['file'],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Image file (JPEG, PNG, WEBP up to 5MB).',
          },
        },
      }),
    },
  },
  '/admin/mystery/images/generate-text': {
    POST: {
      summary: 'Generate illustrated story text',
      description: 'Calls the AI helper that generates descriptive text for mystery scenes.',
    },
  },
  '/admin/blog/images/upload': {
    POST: {
      summary: 'Upload blog assets',
      description: 'Uploads blog images that can be associated with posts.',
      requestBody: buildMultipartRequestBody({
        type: 'object',
        required: ['file'],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Image file (JPEG, PNG, WEBP up to 5MB).',
          },
        },
      }),
    },
  },
  '/auth/login': {
    POST: {
      summary: 'User login',
      description: 'Authenticates public users and initializes their application session.',
      requestBody: buildJsonRequestBody(
        {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' },
          },
          additionalProperties: false,
        },
        { email: 'user@example.com', password: 'P@ssw0rd!' },
      ),
    },
  },
  '/auth/register': {
    POST: {
      summary: 'User registration',
      description: 'Creates a new user account based on the submitted profile.',
      requestBody: buildJsonRequestBody(
        {
          type: 'object',
          required: ['email', 'password', 'firstName', 'lastName'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phoneNumber: { type: 'string', nullable: true },
            age: { type: 'integer', nullable: true },
            educationLevel: { type: 'string', nullable: true },
            workExperience: { type: 'string', nullable: true },
            gender: { type: 'string', nullable: true },
          },
          additionalProperties: false,
        },
        {
          email: 'user@example.com',
          password: 'StrongPass123',
          firstName: 'Ali',
          lastName: 'Rezaei',
        },
      ),
    },
  },
  '/auth/logout': {
    POST: {
      summary: 'User logout',
      description: 'Invalidates the active user session by clearing cookies.',
    },
  },
  '/org/{slug}/login': {
    POST: {
      summary: 'Organization login',
      description: 'Logs an end-user into their organization portal using username/email and password.',
      requestBody: buildJsonRequestBody(
        {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {
              type: 'string',
              description: 'Accepts either username or email.',
            },
            password: { type: 'string', format: 'password' },
          },
          additionalProperties: false,
        },
        { username: 'user@example.com', password: 'Secret123' },
      ),
    },
  },
  '/database/rebuild': {
    POST: {
      summary: 'Rebuild database schema',
      description: 'Triggers database migrations to recreate schema locally (admin only).',
    },
  },
  '/uploads/blog/{slug}': {
    GET: {
      summary: 'Serve blog upload',
      description: 'Streams static blog assets from the uploads directory based on the provided slug path.',
      requestBody: null,
    },
  },
};

const defaultResponses = {
  200: { description: 'Request completed successfully.' },
  400: { description: 'The request payload or parameters are invalid.' },
  401: { description: 'Authentication is required for this operation.' },
  403: { description: 'The caller does not have enough permissions.' },
  404: { description: 'Requested resource was not found.' },
  500: { description: 'The server encountered an unexpected error.' },
} as const;

const toTitleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

const formatSegment = (segment: string) =>
  toTitleCase(segment.replace(/[{}]/g, '').replace(/-/g, ' '));

const buildReadablePath = (path: string) => {
  const segments = path.split('/').filter(Boolean);
  if (!segments.length) {
    return 'Root';
  }
  return segments
    .map((segment) => (segment.startsWith('{') ? `:${segment.slice(1, -1)}` : formatSegment(segment)))
    .join(' / ');
};

const collectPathParameters = (path: string) => {
  const matches = [...path.matchAll(/\{([^}]+)\}/g)];
  return matches.map((match) => {
    const name = match[1];
    return {
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: parameterDescriptions[name] ?? 'Path parameter.',
    };
  });
};

const getTag = (path: string) => {
  if (pathTagOverrides[path]) {
    return pathTagOverrides[path];
  }
  const segment = path.split('/').filter(Boolean)[0];
  if (!segment) {
    return 'Core';
  }
  return toTitleCase(segment.replace(/-/g, ' '));
};

const buildOperation = (method: HttpMethod, path: string, override?: OperationOverride) => {
  const verb = methodLabels[method];
  const readable = buildReadablePath(path);
  const parameters = collectPathParameters(path);
  const requestBody =
    override?.requestBody === null
      ? undefined
      : override?.requestBody ??
        (methodsRequiringBody.includes(method) ? defaultRequestBody : undefined);
  return {
    tags: [getTag(path)],
    summary: override?.summary ?? `${verb.summary} ${readable}`,
    description:
      override?.description ?? `Handles ${verb.description} requests for ${readable} (${path}).`,
    parameters: parameters.length ? parameters : undefined,
    requestBody,
    responses: defaultResponses,
  };
};

const buildPathsObject = () => {
  const entries = Object.entries(pathMethods) as Array<[string, HttpMethod[]]>;
  return entries.reduce<Record<string, Record<string, unknown>>>((acc, [path, methods]) => {
    acc[path] = methods.reduce<Record<string, unknown>>((operations, method) => {
      const override = operationOverrides[path]?.[method];
      operations[method.toLowerCase()] = buildOperation(method, path, override);
      return operations;
    }, {});
    return acc;
  }, {});
};

const deriveTags = () => {
  const names = new Set<string>();
  Object.keys(pathMethods).forEach((path) => names.add(getTag(path)));
  return Array.from(names)
    .sort()
    .map((name) => ({
      name,
      description: tagDescriptions[name] ?? `Operations related to ${name}.`,
    }));
};

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Booteh Backend API',
    version: '1.0.0',
    description:
      'Reference documentation for the Booteh Next.js backend. Each path is relative to the /api base path.',
  },
  servers: [
    {
      url: '/api',
      description: 'Next.js API base path',
    },
  ],
  tags: deriveTags(),
  paths: buildPathsObject(),
} as const;
