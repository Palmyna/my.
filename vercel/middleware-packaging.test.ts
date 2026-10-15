import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('typechecks the middleware independently of referenced TypeScript projects', () => {
  // The Vercel builder reads the nearest tsconfig.json, not the options from
  // tsconfig.vercel.json referenced by tsc -b. TypeScript 6 defaults types to [].
  const config = ts.readConfigFile(resolve('tsconfig.json'), file => ts.sys.readFile(file))
  expect(config.error).toBeUndefined()
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
  expect(parsed.errors).toEqual([])
  const program = ts.createProgram([resolve('middleware.ts')], {
    ...parsed.options,
    target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
  })
  const errors = ts.getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
  expect(errors).toEqual([])
})

it('starts emitted JavaScript in native Node without TypeScript sources or import rewriting', () => {
  const cache = resolve('.cache')
  mkdirSync(cache, { recursive: true })
  const artifact = mkdtempSync(join(cache, 'maintenance-runtime-'))
  try {
    writeFileSync(join(artifact, 'package.json'), JSON.stringify({ type: 'module' }))
    // Vercel emits traced TypeScript files as JavaScript. Exercise that layout without
    // relying on a builder version that happens to rewrite explicit .ts imports.
    for (const file of ['middleware.ts', 'vercel/maintenance-page.ts']) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      const output = ts.transpileModule(source, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          rewriteRelativeImportExtensions: false,
        },
      }).outputText
      const destination = join(artifact, file.replace(/\.ts$/, '.js'))
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, output)
    }

    // A subprocess bypasses Vitest/Vite resolution. Only emitted local files exist;
    // installed SDKs resolve from the repository's node_modules, not a remote store.
    const result = execFileSync(process.execPath, [
      '--no-experimental-strip-types', '--input-type=module', '--eval', `
        import assert from 'node:assert/strict';
        import { pathToFileURL } from 'node:url';
        const { default: middleware } = await import(pathToFileURL(process.argv[1]).href);
        process.env.VERCEL_ENV = 'production';
        process.env.GLOBAL_CONFIG = 'https://global-config.vercel.com/ecfg_packaging_test?token=synthetic-read-token';
        let state = false;
        const keys = [];
        globalThis.fetch = async (url) => {
          keys.push(new URL(url).pathname);
          return new Response(JSON.stringify(state));
        };
        const request = new Request('https://my.example/assets/app.js');
        assert.equal((await middleware(request)).headers.get('x-middleware-next'), '1');
        state = true;
        const closed = await middleware(request);
        assert.equal(closed.status, 503);
        assert.match(await closed.text(), /MY. est momentanément indisponible/);
        assert.equal(closed.headers.get('cache-control'), 'no-store, no-cache, max-age=0, must-revalidate');
        assert.equal(closed.headers.get('cdn-cache-control'), 'no-store');
        assert.equal(closed.headers.get('vercel-cdn-cache-control'), 'no-store');
        assert.equal(closed.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
        assert.equal(await (await middleware(new Request(request, { method: 'HEAD' }))).text(), '');
        assert.ok(keys.every(key => key.endsWith('/maintenance_production')));
        process.env.VERCEL_ENV = 'preview';
        assert.equal((await middleware(request)).status, 503);
        assert.ok(keys.at(-1).endsWith('/maintenance_preview'));
        delete process.env.GLOBAL_CONFIG;
        assert.equal((await middleware(request)).headers.get('x-middleware-next'), '1');
        process.env.VERCEL_ENV = 'production';
        assert.equal((await middleware(request)).status, 503);
        console.log('native JavaScript artifact passed');
      `, join(artifact, 'middleware.js'),
    ], { encoding: 'utf8', timeout: 15_000, env: { ...process.env, NODE_ENV: 'test', NODE_OPTIONS: '' } })
    expect(result.trim()).toBe('native JavaScript artifact passed')
  } finally {
    // Only remove the generated artifact under this repository's cache directory.
    if (dirname(artifact) === cache) rmSync(artifact, { recursive: true, force: true })
  }
})
