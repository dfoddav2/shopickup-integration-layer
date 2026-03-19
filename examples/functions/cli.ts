#!/usr/bin/env ts-node
import path from 'path';
import fs from 'fs';
import inquirer from 'inquirer';

import { loadEnv } from './_lib/env';
import { createHttpClient, buildAdapterContext } from './_lib/context';

const FUNCTIONS_DIR = path.join(__dirname);

function discoverFunctions() {
  const carriers = fs.readdirSync(FUNCTIONS_DIR).filter((f) => fs.statSync(path.join(FUNCTIONS_DIR, f)).isDirectory());
  const modules: Array<{ id: string; file: string }> = [];
  for (const c of carriers) {
    const files = fs.readdirSync(path.join(FUNCTIONS_DIR, c)).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    for (const f of files) {
      const modPath = `./${c}/${f}`;
      const id = `${c}.${path.basename(f, '.ts')}`;
      modules.push({ id, file: modPath });
    }
  }
  return modules;
}

async function main() {
  loadEnv();
  const modules = discoverFunctions();

  const choices = modules.map((m) => ({ name: m.id, value: m }));
  const ans = await inquirer.prompt([{ type: 'list', name: 'sel', message: 'Select function to run', choices }]);

  const mod = await import(ans.sel.file);
  const meta = mod.meta || {};
  console.log(`Selected: ${meta.id || ans.sel.file} - ${meta.description || ''}`);

  const paramsAns = await inquirer.prompt([{ type: 'editor', name: 'args', message: 'Provide JSON args for run(args, ctx)' }]);
  const args = JSON.parse(paramsAns.args || '{}');

  const httpClient = createHttpClient();
  const ctx = { adapterContext: buildAdapterContext(httpClient, console as any) };

  const result = await mod.run(args, ctx);
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
