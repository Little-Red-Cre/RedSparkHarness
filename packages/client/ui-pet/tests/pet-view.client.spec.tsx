// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en, zh } from '../src/client/locales.ts'
import { PetSettingsRow, type PetSettingsRowProps } from '../src/client/PetSettingsRow.tsx'
import { derivePetActivity, PetView, type PetViewProps } from '../src/client/PetView.tsx'
import type { PetSnapshot } from '../src/client/runtime.ts'

const SID = 'pet-test' as SessionId
afterEach(cleanup)
const snapshot: PetSnapshot = {
  enabled: true,
  desktopEnabled: false,
  petId: 'redspark-kitsune',
  variant: 'normal',
  pets: [{ id: 'redspark-kitsune', name: 'Kitsune', variants: [
    { id: 'normal', atlasUrl: '/brand/kitsune-sprites.png' },
    { id: 'chibi', atlasUrl: '/brand/kitsune-chibi-sprites.png' },
  ] }],
  activities: new Map(),
  customPetIds: [],
  revision: 1,
}

function session(changes: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    sessionId: SID, queue: [], pendingSubmissions: [], running: false, subagent: null,
    removed: false, openState: 'open', openError: null, hasMore: false, loadingOlder: false,
    promptError: null, blank: false, lastAgentError: null, promptAttempted: true,
    awaitingFirstTurn: false, ...changes,
  }
}

function viewProps(state: PetSnapshot, value: SessionSnapshot): PetViewProps {
  return {
    placement: 'hero', sessionId: SID,
    usePet: bindSnapshotSelector(createSnapshotStore(state)),
    usePetLifecycle: bindSnapshotSelector(createSnapshotStore(undefined)),
    longRunningAfterMs: 60_000,
    useSession: bindSnapshotSelector(createSnapshotStore(value)),
    useSessionPendingInteraction: bindSnapshotSelector(createSnapshotStore(new Map())),
    t: makeTranslate(en),
  } as unknown as PetViewProps
}

describe('desktop pet presentation', () => {
  it('uses the persisted variant and maps running to the thinking copy', () => {
    const view = render(<PetView {...viewProps(snapshot, session({ running: true }))} />)
    expect(view.getByRole('status').textContent).toBe('Kitsune is thinking…')
    expect(view.getByRole('img').getAttribute('style')).toContain('/brand/kitsune-sprites.png')
  })

  it('uses the RedSpark thinking copy requested for the Chinese presentation', () => {
    const state: PetSnapshot = { ...snapshot, activities: new Map([[SID, 'thinking']]) }
    const props = { ...viewProps(state, session()), t: makeTranslate(zh) }
    const view = render(<PetView {...props} />)
    expect(view.getByRole('status').textContent).toBe('赤绯思考中...')
  })

  it('hides when the shared preference is disabled', () => {
    const view = render(<PetView {...viewProps({ ...snapshot, enabled: false }, session())} />)
    expect(view.container.innerHTML).toBe('')
  })

  it('does not let a greeting conceal running or failed work', () => {
    const view = render(<PetView {...viewProps(snapshot, session())} />)
    fireEvent.click(view.getByRole('button', { name: 'Say hello to Kitsune' }))
    view.rerender(<PetView {...viewProps(snapshot, session({ running: true }))} />)
    expect(view.container.querySelector('[data-state]')?.getAttribute('data-state')).toBe('thinking')
    view.rerender(<PetView {...viewProps(snapshot, session({ lastAgentError: 'failed' }))} />)
    expect(view.container.querySelector('[data-state]')?.getAttribute('data-state')).toBe('error')
  })

  it('clears completion when another session replaces the finished session', () => {
    const view = render(<PetView {...viewProps(snapshot, session({ running: true }))} />)
    view.rerender(<PetView {...viewProps(snapshot, session())} />)
    expect(view.container.querySelector('[data-state]')?.getAttribute('data-state')).toBe('complete')
    view.rerender(<PetView {...viewProps(snapshot, session())} sessionId={'other' as SessionId} />)
    expect(view.container.querySelector('[data-state]')?.getAttribute('data-state')).toBe('idle')
  })

  it('prioritizes error, approval waiting, and running', () => {
    expect(derivePetActivity(session({ running: true, lastAgentError: 'failed' }), true)).toBe('error')
    expect(derivePetActivity(session({ running: true }), true)).toBe('waiting')
    expect(derivePetActivity(session({ running: true }), false)).toBe('thinking')
  })

  it('keeps a specific coding report while the session is running', () => {
    const state: PetSnapshot = { ...snapshot, activities: new Map([[SID, 'coding']]) }
    const view = render(<PetView {...viewProps(state, session({ running: true }))} />)
    expect(view.container.querySelector('[data-state]')?.getAttribute('data-state')).toBe('coding')
    view.rerender(<PetView {...viewProps(state, session({ lastAgentError: 'failed' }))} />)
    expect(view.container.querySelector('[data-state]')?.getAttribute('data-state')).toBe('error')
  })

  it('writes the same variant preference used by hero and floating views', () => {
    const setVariant = vi.fn()
    const props = {
      usePet: bindSnapshotSelector(createSnapshotStore(snapshot)),
      setEnabled: vi.fn(), setPet: vi.fn(), setVariant, t: makeTranslate(en),
    } as unknown as PetSettingsRowProps
    const view = render(<PetSettingsRow {...props} />)
    fireEvent.click(view.getByRole('button', { name: 'Chibi' }))
    expect(setVariant).toHaveBeenCalledWith('chibi')
  })
})
