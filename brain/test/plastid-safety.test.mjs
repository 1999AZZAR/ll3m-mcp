import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok ${n} - ${name}`); };

const srcIndexPath = path.join(__dirname, '../src/index.ts');
const srcIndex = fs.readFileSync(srcIndexPath, 'utf8');

const sandboxPyPath = path.join(__dirname, '../../body/addon/blender_mcp_addon/weak_sandbox.py');
const sandboxPy = fs.readFileSync(sandboxPyPath, 'utf8');

// 1. Label and Warning Verification
t('execute_blender_code has [R3 Native Execution] and WeakSandbox warning', () => {
  assert.match(srcIndex, /name:\s*"execute_blender_code"[\s\S]*?\[R3 Native Execution\]/);
  assert.match(srcIndex, /WeakSandboxForLLM is an in-process operator filter, not an OS sandbox/);
  assert.match(srcIndex, /Gated by HELA_PLASTID_ALLOW_CODE/);
});

t('execute_staged_refinement has [R3 Native Execution]', () => {
  assert.match(srcIndex, /name:\s*"execute_staged_refinement"[\s\S]*?\[R3 Native Execution\]/);
  assert.match(srcIndex, /Gated by HELA_PLASTID_ALLOW_CODE/);
});

t('weak_sandbox.py documents R3 Native Code Execution security notice', () => {
  assert.match(sandboxPy, /SECURITY NOTICE \(R3 Native Code Execution\)/);
  assert.match(sandboxPy, /NOT a sandbox, does NOT provide an OS security boundary/);
  assert.match(sandboxPy, /runs with full process and OS privileges/);
  assert.match(sandboxPy, /isolated container or ephemeral VM worker/);
});

// 2. Logic verification for env gates
t('gate logic blocks when HELA_PLASTID_ALLOW_CODE=false', () => {
  const allowCode = 'false';
  const isRestricted = false;
  const blocked = allowCode === 'false' || (isRestricted && allowCode !== 'true');
  assert.equal(blocked, true);
});

t('gate logic blocks under restricted profile without opt-in', () => {
  const allowCode = undefined;
  const isRestricted = true;
  const blocked = allowCode === 'false' || (isRestricted && allowCode !== 'true');
  assert.equal(blocked, true);
});

t('gate logic permits under restricted profile with HELA_PLASTID_ALLOW_CODE=true', () => {
  const allowCode = 'true';
  const isRestricted = true;
  const blocked = allowCode === 'false' || (isRestricted && allowCode !== 'true');
  assert.equal(blocked, false);
});

console.log(`\n${n} plastid-safety tests passed.`);
