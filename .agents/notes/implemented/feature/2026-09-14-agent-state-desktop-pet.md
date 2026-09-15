# Agent Note: Agent-state desktop pet

Status: implemented

English | [中文](2026-09-14-agent-state-desktop-pet.zh.md)

## Problem

The RedSpark mascot was welcome-screen decoration owned by Conversation. It could not follow Agent state, persist a presentation choice, float beside an active task, or accept independently supplied characters without changing Conversation code.

## Decision

Create `dsh-client-ui-pet` as the sole owner of desktop-pet registry entries, durable preferences, semantic activities, copy, and presentation. Conversation declares one session-optional `conversation.pet` slot and requests either `hero` or `floating` placement. The built-in RedSpark entry supplies normal and chibi four-frame atlases. One persisted selection drives both placements. Session state derives idle, thinking, waiting, error, and completion; other plugins may report coding, tool work, or sleeping through `ctx.pet` without a runtime import between feature packages. The Electron carrier accepts only a selected local or bounded embedded PNG frame and localized label, and owns its transparent draggable always-on-top window.

This decision supersedes only the 2026-09-13 RedSpark brand note's alternative that confined character art to the empty welcome screen. That note remains authoritative for product identity, attribution, and provider naming.

## Alternatives considered

**Keep the implementation in Conversation:** rejected because character registration, settings, assets, animation, and Agent-state policy would make the target-neutral Conversation shell a mascot owner.

**Make the Client plugin create Electron windows:** rejected because browser composition must not import Electron or own operating-system lifecycle. The desktop carrier remains an optional presentation adapter with a narrow validated IPC message.

**Bind the mascot to model or theme selection:** rejected for this iteration. Pet identity and presentation are independent user preferences.

## Consequences

The shipped Web composition has one default character, two synchronized variants, and a General > Personalization settings surface. Electron users can also enable a transparent always-on-top desktop window outside a Conversation. Third-party plugins can register additional characters or report semantic activities. The current four-frame atlas reuses poses across several semantic states, and the built-in asset URLs remain owned by the Web deployment.
