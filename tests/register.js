const fs = require('fs');
const path = require('path');

let ts;
try {
  // Prefer local dependency if available
  ts = require('typescript');
} catch {
  const fallback = path.resolve(
    __dirname,
    '..',
    '..',
    'bootehfrontv4',
    'node_modules',
    'typescript',
  );
  ts = require(fallback);
}

const Module = require('module');

const projectSrc = path
  .resolve(__dirname, '..', 'src')
  .replace(/\\/g, '/');

const shimsDir = path.resolve(__dirname, 'shims');
const nextServerShim = path.join(shimsDir, 'next-server.js');
const mysqlShim = path.join(shimsDir, 'mysql2-promise.js');
const jwtShim = path.join(shimsDir, 'jsonwebtoken.js');
const nextHeadersShim = path.join(shimsDir, 'next-headers.js');
const zodShim = path.join(shimsDir, 'zod.js');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
  if (request === 'next/server') {
    return nextServerShim;
  }
  if (request === 'mysql2/promise') {
    return mysqlShim;
  }
  if (request === 'jsonwebtoken') {
    return jwtShim;
  }
  if (request === 'next/headers') {
    return nextHeadersShim;
  }
  if (request === 'zod') {
    return zodShim;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const resolveAliases = (code) =>
  code.replace(/(['"])@\/([^'"]+)\1/g, (_match, quote, subPath) => {
    return `${quote}${projectSrc}/${subPath}${quote}`;
  });

const transpile = (source, filename) => {
  const transformed = resolveAliases(source);
  const result = ts.transpileModule(transformed, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowJs: true,
    },
    fileName: filename,
  });
  return result.outputText;
};

require.extensions['.ts'] = function register(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = transpile(source, filename);
  module._compile(output, filename);
};

require.extensions['.tsx'] = require.extensions['.ts'];
