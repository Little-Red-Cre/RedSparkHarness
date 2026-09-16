import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { liveChunkEvent, parseResumeArgs } from '../src/runtime.js';

describe('parseResumeArgs', () => {
  test('accepts fresh startup and the short resume form', () => {
    assert.deepEqual(parseResumeArgs([]), { kind: 'fresh' });
    assert.deepEqual(parseResumeArgs(['resume']), { kind: 'resume' });
    assert.deepEqual(parseResumeArgs(['resume', 'session-123']), { kind: 'resume', sessionId: 'session-123' });
  });

  test('accepts the explicit compatibility form and rejects unrelated argv', () => {
    assert.deepEqual(parseResumeArgs(['--resume', 'session-123']), { kind: 'resume', sessionId: 'session-123' });
    assert.throws(() => parseResumeArgs(['--resume']), /usage/);
    assert.throws(() => parseResumeArgs(['unknown']), /usage/);
  });
});

describe('liveChunkEvent', () => {
  test('forwards a reasoning delta to the TUI event format', () => {
    const chunk = { type: 'reasoning-delta', index: 0, text: 'inspect the request' };
    assert.deepEqual(liveChunkEvent({ type: 'chunk', chunk }), {
      type: 'assistant/chunk',
      data: { chunk },
    });
  });

  test('forwards text and tool chunks without changing their provider payload', () => {
    for (const chunk of [
      { type: 'text-delta', index: 0, text: 'answer' },
      { type: 'tool-call-delta', index: 1, id: 'call-1', argumentsDelta: '{' },
    ]) {
      assert.equal(liveChunkEvent({ type: 'chunk', chunk }).data.chunk, chunk);
    }
  });

  test('does not render start, end, or malformed frames as chunks', () => {
    assert.equal(liveChunkEvent({ type: 'start' }), undefined);
    assert.equal(liveChunkEvent({ type: 'end' }), undefined);
    assert.equal(liveChunkEvent(null), undefined);
  });
});
