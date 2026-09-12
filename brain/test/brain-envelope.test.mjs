import assert from 'node:assert/strict';
import {
  SERVER_NAME, TOOL_SIDE_EFFECTS, isEnvelopeEnabled,
  wrapResult, wrapError, textResult,
} from '../src/envelope.ts';

const KEYS = ['ok','summary','data','artifacts','provenance','warnings','sideEffects','execution','redaction'];
let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok ${n} - ${name}`); };

delete process.env['HELA_ENVELOPE'];
t('flag off by default', () => assert.equal(isEnvelopeEnabled(), false));
t('off-mode passes text through byte-identical', () => {
  const r = textResult('get_api_docs', 'DOCS...');
  assert.equal(r.content[0].text, 'DOCS...');
});

process.env['HELA_ENVELOPE'] = 'true';
t('on-mode envelope has all 9 keys', () => {
  const env = JSON.parse(textResult('get_scene_summary', '{"a":1}').content[0].text);
  for (const k of KEYS) assert.ok(k in env, `missing ${k}`);
  assert.equal(env.ok, true);
  assert.equal(env.execution.serverName, SERVER_NAME);
});
t('mutating tools declare blender side effects, reads empty', () => {
  assert.deepEqual(TOOL_SIDE_EFFECTS['execute_blender_code'], ['blender-execute']);
  assert.deepEqual(TOOL_SIDE_EFFECTS['execute_staged_refinement'], ['blender-execute']);
  assert.deepEqual(TOOL_SIDE_EFFECTS['save_blend'], ['blender-save']);
  assert.deepEqual(TOOL_SIDE_EFFECTS['render_output'], ['blender-render']);
  assert.deepEqual(TOOL_SIDE_EFFECTS['navigation'], ['blender-navigate']);
  for (const tool of ['get_api_docs','get_scene_summary','get_screenshot','generate_modeling_plan']) {
    assert.deepEqual(TOOL_SIDE_EFFECTS[tool], [], tool);
  }
  const env = JSON.parse(textResult('save_blend', '{}').content[0].text);
  assert.deepEqual(env.sideEffects, ['blender-save']);
});
t('legacy inner-catch error text preserved verbatim in data', () => {
  const env = JSON.parse(textResult('get_api_docs', 'Error fetching docs: x').content[0].text);
  assert.equal(env.data, 'Error fetching docs: x');
});
t('run/step ids propagate', () => {
  process.env['HELA_RUN_ID'] = 'r1';
  process.env['HELA_STEP_ID'] = 's2';
  assert.equal(wrapResult('get_scene_summary', {}).execution.run_id, 'r1');
  assert.equal(wrapError('get_scene_summary', 'e').execution.step_id, 's2');
});
console.log(`\n${n} tests passed`);
