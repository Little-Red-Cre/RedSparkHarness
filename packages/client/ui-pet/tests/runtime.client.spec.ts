import { Context } from '@deepseek-ai/cordis'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PetSettings } from '../src/pet-settings.ts'
import { PetRuntime } from '../src/client/runtime.ts'

const SID = 'pet-session' as SessionId

describe('PetRuntime', () => {
  it('keeps a replacement report when an older identical report is disposed', () => {
    const runtime = new PetRuntime(new Context(), stubSettingsScope<PetSettings>().scope)
    const old = runtime.setActivity(SID, 'tool', 'working')
    const current = runtime.setActivity(SID, 'tool', 'working')
    old()
    expect(runtime.state.getSnapshot().activities.get(SID)).toBe('working')
    current()
    expect(runtime.state.getSnapshot().activities.get(SID)).toBeUndefined()
  })
  it('registers independent characters and removes only the owning entry', () => {
    const runtime = new PetRuntime(new Context(), stubSettingsScope<PetSettings>().scope)
    const dispose = runtime.register({ id: 'custom', name: 'Custom', variants: [{ id: 'base', atlasUrl: '/custom.png' }] })
    expect(runtime.state.getSnapshot().pets.map(pet => pet.id)).toEqual(['custom'])
    expect(() => { runtime.register({ id: 'custom', name: 'Again', variants: [{ id: 'x', atlasUrl: '/x.png' }] }) }).toThrow('already registered')
    expect(() => { runtime.register({ id: 'empty', name: 'Empty', variants: [] }) }).toThrow('has no variants')
    dispose()
    dispose()
    expect(runtime.state.getSnapshot().pets).toEqual([])
  })

  it('publishes the latest activity and restores the preceding source after disposal', () => {
    const runtime = new PetRuntime(new Context(), stubSettingsScope<PetSettings>().scope)
    const disposeThinking = runtime.setActivity(SID, 'agent', 'thinking')
    const disposeCoding = runtime.setActivity(SID, 'coding-tool', 'coding')
    expect(runtime.state.getSnapshot().activities.get(SID)).toBe('coding')
    disposeCoding()
    expect(runtime.state.getSnapshot().activities.get(SID)).toBe('thinking')
    disposeThinking()
    expect(runtime.state.getSnapshot().activities.get(SID)).toBeUndefined()
  })

  it('isolates reports with identical source names in separate sessions', () => {
    const runtime = new PetRuntime(new Context(), stubSettingsScope<PetSettings>().scope)
    const other = 'other-session' as SessionId
    const dispose = runtime.setActivity(SID, 'tool', 'coding')
    runtime.setActivity(other, 'tool', 'working')
    expect(runtime.state.getSnapshot().activities.get(SID)).toBe('coding')
    expect(runtime.state.getSnapshot().activities.get(other)).toBe('working')
    dispose()
    expect(runtime.state.getSnapshot().activities.has(SID)).toBe(false)
    expect(runtime.state.getSnapshot().activities.get(other)).toBe('working')
  })

  it('routes preference writes through the settings scope', () => {
    const host = stubSettingsScope<PetSettings>()
    const runtime = new PetRuntime(new Context(), host.scope)
    runtime.setPreference('variant', 'chibi')
    expect(host.set).toHaveBeenCalledWith('variant', 'chibi')
  })
})
