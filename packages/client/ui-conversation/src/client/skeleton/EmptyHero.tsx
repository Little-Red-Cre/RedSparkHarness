// The composer remains in ConversationRoot so switching out of the blank-draft
// phase does not remount its textarea.

import { useState, type ReactNode, type RefObject } from 'react'
import {
  FishLogo, IconChevronDownOutline14, IconFolderClose16, IconFolderOpen16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { ConversationSlotProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'

/** The owner's locale seat type, passed to hero chrome as a plain prop. */
type HeroTranslate = ConversationSlotProps['t']

/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd: string): string {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  label?: string | undefined
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('hero.chooseWorkspace')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      {label === undefined
        ? <IconFolderClose16 className={css.folder} size={16} />
        : <IconFolderOpen16 className={css.folder} size={16} />}
      <span className={css.workspaceLabel}>{label ?? t('hero.chooseWorkspace')}</span>
      <IconChevronDownOutline14 className={css.chevron} size={12} />
    </button>
  )
}

/** Hero chrome props. The workspace row rides the InputBar accessory hole, not here. */
export interface HeroShellProps {
  /** The owner's locale seat, passed down as a plain prop. */
  t: HeroTranslate
  /** Authorized renderer for the hero brand-mark slot. */
  renderSlot: ConversationSlotProps['renderSlot']
  /** Overlay content after the stack (modals). */
  children?: ReactNode
}

/**
 * Render the hero chrome (headline only; no composer, no workspace row).
 * @param props - see {@link HeroShellProps}.
 * @returns the centered hero element tree.
 */
export function HeroShell({ t, renderSlot, children }: HeroShellProps) {
  const [petHappy, setPetHappy] = useState(false)
  const [petPaused, setPetPaused] = useState(false)
  const [petMotionEnabled, setPetMotionEnabled] = useState(false)
  return (
    <div className={css.root}>
      <div className={css.stack}>
        <div className={css.petStage} data-paused={petPaused} data-happy={petHappy} data-motion-enabled={petMotionEnabled}>
          <div className={css.orbit} aria-hidden="true" />
          <span className={css.spark} aria-hidden="true">✦</span>
          <span className={css.sparkSmall} aria-hidden="true">✧</span>
          <button type="button" className={css.character} aria-label={t('hero.petInteract')}
            aria-pressed={petHappy} onClick={() => { setPetHappy(value => !value) }}>
            <span className={css.sprite} role="img" aria-label={t('hero.character')} />
          </button>
          <span className={css.petSpeech} role="status">{t(petHappy ? 'hero.petHappy' : 'hero.petHello')}</span>
          <button type="button" className={css.petPause} aria-pressed={petPaused}
            onClick={() => {
              if (!petMotionEnabled) setPetMotionEnabled(true)
              else setPetPaused(value => !value)
            }}>{t(!petMotionEnabled ? 'hero.petEnable' : petPaused ? 'hero.petResume' : 'hero.petPause')}</button>
        </div>
        <p className={css.eyebrow}>{t('hero.eyebrow')}</p>
        <div className={css.headline}>
          {/* figma 34:10412: fish 34×25 leading the headline, gap 10. */}
          <span
            className={css.fishHitbox}
          >
            {renderSlot('conversation.hero.brand.mark', { size: 34, className: css.fish }, {
              fallback: <FishLogo size={34} className={css.fish} />,
            })}
          </span>
          <span className={css.titleGroup}>
            {/* Own element: keeps the headline text addressable apart from the badge. */}
            <span>{t('hero.headline')}</span>
            <span className={css.previewBadge}>{t('hero.preview')}</span>
          </span>
        </div>
        <p className={css.tagline}>{t('hero.tagline')}</p>
        <div className={css.body}>
          {/* The composer remains mounted outside this component. */}
        </div>
      </div>
      {children}
    </div>
  )
}
