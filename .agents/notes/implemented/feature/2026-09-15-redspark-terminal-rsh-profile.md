# Agent Note: RedSpark terminal rsh profile

Status: implemented

English | [中文](2026-09-15-redspark-terminal-rsh-profile.zh.md)

## Problem

RedSpark had browser, desktop, headless, SDK, and ACP surfaces but no persistent terminal chat for developers who work from a shell. A second direct Node executable would bypass the profile lifecycle, bundle layering, safety composition, session persistence, and the established rule that `dsh` is the supported Node application launcher.

## Decision

`@deepseek-ai/dsh-rsh` is an in-box bundle mounted by the shipped `rsh` profile after `@deepseek-ai/dsh-base`. `rsh-startup` owns the application flags and `rsh-runner` owns one interactive terminal plus the returned Agent handle it creates or resumes. It waits for Loader settlement, uses the default selected model for a scoped Agent, observes the initial immutable Session through `ctx.sessionQuery`, folds committed `session/event` records into a full-screen transcript, and hands normal exit to the launcher so the owning Cordis fiber disposes the handle during whole-app teardown.

The terminal enters Node raw mode and the ANSI alternate screen. Its composer accepts multi-line input through `Ctrl+J`, sends ordinary messages with `Agent.followup`, dispatches known slash commands through `ctx.commands`, and lets users cancel active work with `Ctrl+C`. It renders durable user, assistant, Tool, command, and approval records; `agent/assistant-stream` only supplies transient unsettled text and reasoning. The scoped `approval/request` answerer queues requests for the owned Agent and resolves the current request as `allowed-once` or `rejected`; unavailable answerers still fail closed in the approval service.

`Ctrl+K` opens an arrow-key control center for the configured model catalog, the current route's reasoning effort, plan/default mode, and the existing permission presets. RSH validates model selections through `ctx.llm`, updates its Agent-scoped selection reference for the next request, and attempts to save the valid selection as the default for later sessions. The existing selection listeners couple that reference to prompt assembly and request routing, and log the normal model-change notice. Mode choices call `ctx.planMode`; permission choices dispatch `/permission`, preserving its approval-policy injection and durable knob events. `Ctrl+P` toggles plan mode, while left/right, Home, End, and Delete edit the composer without moving its history.

The user-facing Windows `rsh` command is a shell shim installed by `scripts/install-rsh.ps1`; it launches the checkout's source `dsh` entry with `--profile rsh` and its host TypeScript path mapping. It creates no second Node application or package bin, preserves the calling working directory, and keeps profile composition as the only runtime path. The shell installer refuses to overwrite an existing command and must be rerun if the checkout moves.

`rsh resume` opens a terminal session browser before any Agent mounts. It lists durable top-level RSH sessions, defaults to the calling directory, derives a searchable title from the first user message, and lets the user switch to all directories or reorder by update or creation time. Enter resumes the highlighted session through `agents.resume`; Esc starts a fresh session and Ctrl+C exits. `rsh resume <session-id>` remains the deterministic direct-resume form for scripts and support work.

The design uses dsh-TUI as interaction reference material, especially its distinction between live model frames and Session-derived transcript state. Its React renderer and private workspace packages are not copied because their dependency graph is not a supported RedSpark runtime dependency. The RSH renderer stays a small Node-native terminal owner, so the profile adds no second Node application or unproven UI dependency.

## Alternatives considered

**Vendor dsh-TUI unchanged.** Rejected because it exports its own `dsh-tui` and `dst` Node bins and relies on a large React renderer plus private `@dsh-std/*` workspace dependencies. Those do not resolve through this repository's runtime closure and would introduce a second application owner.

**Add an `rsh` npm bin.** Rejected because a package-bin entry would bypass the repository's launcher rule. A shell shim forwards to `dsh --profile rsh` instead.

**Adopt a third-party terminal renderer.** Rejected because the current renderer needs a small raw-key and ANSI alternate-screen contract, while adding a renderer would expand the runtime closure without deleting an existing compatible UI layer. A future renderer dependency needs an explicit consumer and platform evaluation.

**Make the Web UI the terminal implementation.** Rejected because browser transport and terminal input own different lifecycle and output behavior; terminal consumers need a direct Session and Agent driver.

## Verification

The RSH startup provider has a real Loader-composition test for prompt and resume argument parsing plus help behavior. Runner tests drive a scripted raw terminal, assert full-screen entry, durable transcript rendering, control-center model switching, plan toggle, Session flush, normal-exit teardown handoff, exit code, non-TTY rejection, and an `approval/request` result selected through the terminal. Model-control tests pin advisory catalog fallback, exact route validation, default persistence, and settings-write failure. Pure tests pin Tool/command/approval folding and the rendered live-output, multi-line-composer, selector, and approval frame. The shipped profile remains covered by the profile-template and launcher help checks. These tests do not prove a real provider response or a human terminal-layout review.

## Consequences

Developers receive a persistent terminal TUI that shares the normal base tools, provider catalog, safety policy, and durable Session format with other RedSpark applications. The `rsh resume` browser makes recent sessions discoverable without memorizing IDs; resumed sessions render their retained durable transcript, Tool calls expose their arguments, output, and settlement status, and approval asks require an explicit terminal decision. Model and reasoning choices become the next request's exact route and persist as the default when the settings provider accepts the write; an unsuccessful default write leaves the live validated selection in place and is reported in the terminal. Mouse interaction and session-wide approval grants remain outside this TUI; IDE protocol integration remains with the existing ACP profile. The global Windows shim is checkout-bound rather than a publishable package command, which preserves the launcher rule but requires reinstallation after moving the repository.
