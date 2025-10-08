// esbuild.config.mjs — no obfuscation
import esbuild from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWatch = process.argv.includes('--watch');
const outDir  = path.join(__dirname, 'dist');
const meta    = (await fs.readFile(path.join(__dirname, 'meta.userscript.js'), 'utf8')).trim() + '\n';
await fs.mkdir(outDir, { recursive: true });

const baseOptions = {
  entryPoints: [path.join(__dirname, 'src', 'main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,             // minify en prod, pas en watch
  sourcemap: isWatch ? 'inline' : false,
  legalComments: 'none',
  write: false,                 // on récupère le bundle en mémoire
  logLevel: 'info',
};

async function buildBundle() {
  const result = await esbuild.build(baseOptions);
  const bundled = result.outputFiles?.[0]?.text;
  if (!bundled) throw new Error('No outputFiles from esbuild');
  return bundled;
}

async function writeOutput(code) {
  const filename = isWatch ? 'quinoa-ws.dev.user.js' : 'quinoa-ws.min.user.js';
  const file = path.join(outDir, filename);
  await fs.writeFile(file, meta + code, 'utf8');
  console.log('✅ Built ->', file);
}

async function buildAll() {
  const code = await buildBundle();
  await writeOutput(code);
}

if (isWatch) {
  const ctx = await esbuild.context(baseOptions);
  await ctx.watch({
    onRebuild(err, result) {
      if (err) return console.error('❌ Rebuild failed:', err);
      const code = result.outputFiles?.[0]?.text ?? '';
      writeOutput(code).catch(console.error);
    },
  });
  console.log('👀 Watching… (Ctrl+C to quit)');
  await buildAll();
} else {
  await buildAll();
}
