import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConversationNodeDefinition, ConversationViewDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { registerPetProjection, type PetLifecycle } from '../src/client/activity-projection.ts'

function harness() {
  const events: ConversationNodeDefinition[] = []
  const views: ConversationViewDefinition[] = []
  registerPetProjection({ uiConversation: {
    events: { register: (definition: ConversationNodeDefinition) => { events.push(definition) } },
    views: { register: (definition: ConversationViewDefinition) => { views.push(definition) } },
  } } as unknown as Context, { codingTools: ['edit'], planningTools: ['todo_write'] })
  const assembler = new ConversationNodeAssembler({ entries: () => events, fallbackEntry: () => undefined }, { entries: () => views })
  assembler.activateTarget('pet-activity')
  return {
    assembler,
    state: () => { assembler.flush(); return assembler.snapshot('pet-activity') as PetLifecycle | undefined },
  }
}

function event(seq: number, type: string, data: unknown) {
  return { type: 'event' as const, event: { seq, type, data, time: 1000 + seq } as SessionEvent }
}

describe('pet activity Conversation projection', () => {
  it('tracks coding, planning, generic tools, rate limiting, and retry recovery', () => {
    const { assembler, state } = harness()
    assembler.replaceWindow([event(1, 'turn/start', { turn: 1 })], false)
    expect(state()?.activity).toBe('thinking')
    assembler.append(event(2, 'tool/call', { turn: 1, step: 1, callId: 'a', name: 'edit', arguments: '{}' }))
    expect(state()?.activity).toBe('coding')
    assembler.append(event(3, 'tool/call', { turn: 1, step: 1, callId: 'b', name: 'todo_write', arguments: '{}' }))
    expect(state()?.activity).toBe('planning')
    assembler.append(event(4, 'tool/result', { turn: 1, step: 1, message: { source: { callId: 'b' }, content: [] } }))
    expect(state()?.activity).toBe('coding')
    assembler.append(event(5, 'tool/call', { turn: 1, step: 1, callId: 'c', name: 'bash', arguments: '{}' }))
    expect(state()?.activity).toBe('working')
    assembler.append(event(6, 'llm/retry', { turn: 1, step: 1, failure: { code: 'RATE_LIMIT' } }))
    expect(state()?.activity).toBe('sleeping')
    assembler.append(event(7, 'llm/retry-started', { turn: 1, step: 1 }))
    expect(state()?.activity).toBe('thinking')
    assembler.append(event(8, 'turn/end', { turn: 1, reason: { kind: 'completed' } }))
    expect(state()?.active).toBe(false)
  })

  it('restores the running turn after a separately identified compaction finishes', () => {
    const { assembler, state } = harness()
    assembler.replaceWindow([event(1, 'turn/start', { turn: 1 })], false)
    assembler.append(event(2, 'compaction/start', { turn: 1, compactionId: 'compact-a' }))
    expect(state()?.activity).toBe('compacting')
    assembler.append(event(3, 'compaction/end', { turn: 1, compactionId: 'compact-a' }))
    expect(state()?.activity).toBe('thinking')
  })

  it('reconstructs an update-only tail when pagination supplies its turn start', () => {
    const full = harness()
    const paged = harness()
    const start = event(1, 'turn/start', { turn: 1 })
    const call = event(2, 'tool/call', { turn: 1, step: 1, callId: 'a', name: 'edit', arguments: '{}' })
    full.assembler.replaceWindow([start, call], false)
    paged.assembler.replaceWindow([call], true)
    expect(paged.state()).toBeUndefined()
    paged.assembler.prepend([start], false)
    expect(paged.state()).toEqual(full.state())
  })
})
