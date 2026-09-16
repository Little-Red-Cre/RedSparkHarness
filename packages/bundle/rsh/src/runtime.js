/**
 * RedSpark CLI — interactive terminal chat for RedSpark Harness. Cordis bundle
 * plugin (package `dsh-rsh`), composed over dsh-base + dsh-headless; the patch
 * disables the headless one-shot rows and inserts this runner. Drives the core
 * Agent exactly like the headless runner, but streams session events into an
 * Ink chat UI instead of printing a single answer.
 */

import { randomUUID } from 'node:crypto';
import React from 'react';
import { probeTerminalBg } from './theme.js';
import { render } from 'ink';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { App, ResumePicker } from './ui.js';

/** Stable Cordis plugin name (bundle row id: tui-runner). */
export const name = 'tui-runner';

/** Core services required before the interactive session can start. */
export const inject = ['agentDefaultModel', 'agentPresets', 'agents', 'commands', 'llm', 'permissionPresets', 'sessions'];

/**
 * Parse RSH-owned resume forms from the launcher-provided inner argv.
 * @param {readonly string[]|undefined} args - arguments after `--profile rsh`.
 * @returns {{ kind: 'fresh' } | { kind: 'resume', sessionId?: string }} startup request.
 */
export function parseResumeArgs(args = []) {
  if (args.length === 0) {
    return { kind: 'fresh' };
  }
  const [command, id, ...rest] = args;
  if (command === 'resume' && rest.length === 0) {
    if (id !== undefined && id.trim() === '') {
      throw new Error('rsh: resume session id cannot be empty');
    }
    return { kind: 'resume', ...(id === undefined ? {} : { sessionId: id }) };
  }
  if (command === '--resume' && id !== undefined && rest.length === 0 && id.trim() !== '') {
    return { kind: 'resume', sessionId: id };
  }
  throw new Error('rsh usage: rsh [resume [session-id]]');
}

/**
 * Bridge between the Cordis event bus (non-React) and the Ink tree. The App
 * installs its event consumer by calling the `onEvent` prop with a function
 * once mounted; matching durable Session events and process-local assistant
 * stream frames are then forwarded to it. Events are dropped until the App
 * mounts.
 */
let uiHandler = undefined;
function forward(eventOrHandler) {
  if (typeof eventOrHandler === 'function' || eventOrHandler == null) {
    uiHandler = typeof eventOrHandler === 'function' ? eventOrHandler : undefined;
    return;
  }
  if (typeof uiHandler === 'function') {
    uiHandler(eventOrHandler);
  }
}

/**
 * Convert one process-local assistant frame into the event shape consumed by
 * the TUI. Start and end frames carry lifecycle metadata only; chunk frames
 * carry the actual provider output and are therefore the only ones rendered.
 * @param {unknown} frame - agent-scoped assistant stream frame.
 * @returns {object|undefined} a renderable TUI event when the frame is a chunk.
 */
export function liveChunkEvent(frame) {
  if (frame === null || typeof frame !== 'object' || frame.type !== 'chunk') {
    return undefined;
  }
  return { type: 'assistant/chunk', data: { chunk: frame.chunk } };
}

/**
 * Mount the interactive chat driver.
 * @param ctx - plugin context carrying core services and the launcher-provided exit.
 */
export function apply(ctx) {
  // appExit is an optional host value provided by the launcher — read it
  // through the global service store, never the property proxy.
  const exit = ctx.get('appExit');
  if (exit === undefined) {
    throw new Error('tui-runner: the launcher must provide ctx.appExit before the tree mounts');
  }
  void run(ctx, exit).catch(error => {
    console.error(`rsh: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  });
}

/** Create the agent and run the chat until the user quits. */
async function run(ctx, exit) {
  // Probe the terminal background BEFORE Ink mounts: Ink's key parser would
  // otherwise read the OSC 11 response as keystrokes and type garbage.
  const themeBg = await probeTerminalBg();

  // Loader siblings mount concurrently; await the complete composition before
  // creating an Agent so its scoped tools are not half-composed.
  await ctx.get('loader')?.await();

  const agents = ctx.get('agents');
  const agentPresets = ctx.get('agentPresets');
  const defaultModel = ctx.get('agentDefaultModel');
  const sessions = ctx.get('sessions');
  // Early process shutdown can dispose the tree while settlement is pending.
  if (agents === undefined || agentPresets === undefined || defaultModel === undefined || sessions === undefined) {
    return;
  }

  /** Create one isolated interactive session under its selected preset. */
  const createSession = async presetId => {
    const selection = defaultModel.currentSelection();
    const selectionRef = { current: selection, assembled: undefined };
    let preset;
    const handle = await agents.create({
      sessionId: SessionId(`session-${randomUUID()}`),
      meta: { cwd: process.cwd(), ...(presetId === undefined ? {} : { agentPreset: presetId }) },
      agentOptions: { provider: selection.provider, model: selection.model },
      setup: async agentCtx => {
        installModelSelection(agentCtx, selectionRef);
        preset = await agentPresets.mount(agentCtx, presetId);
      },
    });
    await handle.agent.whenIdle();
    return {
      handle,
      selection,
      selectionRef,
      preset: preset.id,
      firstSeq: handle.agent.session.seq,
      hasStarted: false,
      initialEvents: [],
    };
  };

  /** Restore one durable session, including its transcript for initial TUI replay. */
  const resumeSession = async sessionId => {
    const persistence = ctx.get('sessionPersistence');
    if (persistence === undefined) {
      throw new Error('rsh: session persistence is not configured; resume is unavailable');
    }
    const reader = await persistence.open(SessionId(sessionId), 'read');
    let storedEvents;
    const storedHeader = reader.header;
    try {
      storedEvents = (await reader.read()).events;
    } finally {
      await reader.close();
    }
    const selection = defaultModel.currentSelection();
    const selectionRef = { current: selection, assembled: undefined };
    const rememberedPreset = typeof storedHeader.agentPreset === 'string'
      ? storedHeader.agentPreset
      : undefined;
    let preset;
    const handle = await agents.resume({
      resumeSessionId: SessionId(sessionId),
      setup: async agentCtx => {
        installModelSelection(agentCtx, selectionRef);
        preset = await agentPresets.mount(agentCtx, rememberedPreset);
      },
    });
    await handle.agent.whenIdle();
    return {
      handle,
      selection,
      selectionRef,
      preset: preset.id,
      firstSeq: 0,
      hasStarted: true,
      initialEvents: storedEvents,
    };
  };

  const resumeRequest = parseResumeArgs(ctx.get('cmdlineArgs')?.get());
  const resumeTitle = events => {
    for (const event of events) {
      if (event.type !== 'user/message' || event.data === null || typeof event.data !== 'object') {
        continue;
      }
      const content = event.data.content;
      if (!Array.isArray(content)) {
        continue;
      }
      const text = content
        .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (text !== '') {
        return text;
      }
    }
    return 'Untitled session';
  };
  const listResumeSessions = async () => {
    const persistence = ctx.get('sessionPersistence');
    if (persistence === undefined) {
      throw new Error('rsh: session persistence is not configured; resume is unavailable');
    }
    const candidates = (await persistence.list())
      .filter(item => String(item.header.id).startsWith('session-'));
    return Promise.all(candidates.map(async item => {
      const reader = await persistence.open(item.header.id, 'read');
      let events;
      try {
        const first = (await reader.read(0, 96)).events;
        const count = item.eventCount ?? first.length;
        const tail = count > first.length
          ? (await reader.read(Math.max(first.length, count - 8), 8)).events
          : first;
        events = [...first, ...tail.filter(event => event.seq >= first.length)];
      } finally {
        await reader.close();
      }
      const last = events.at(-1);
      return {
        id: String(item.header.id),
        cwd: item.header.cwd ?? '',
        createdAt: item.header.createdAt,
        updatedAt: typeof last?.time === 'number' ? last.time : item.header.createdAt,
        title: resumeTitle(events),
      };
    }));
  };

  const chooseResumeSession = async summaries => new Promise(resolve => {
    const pickerRef = { current: undefined };
    const settle = result => {
      try {
        pickerRef.current?.unmount();
      } finally {
        resolve(result);
      }
    };
    pickerRef.current = render(React.createElement(ResumePicker, {
      sessions: summaries,
      cwd: process.cwd(),
      onResume: sessionId => settle({ kind: 'resume', sessionId }),
      onStartNew: () => settle({ kind: 'fresh' }),
      onQuit: () => settle({ kind: 'quit' }),
    }), { exitOnCtrlC: false });
  });

  let resumeId = resumeRequest.kind === 'resume' ? resumeRequest.sessionId : undefined;
  if (resumeRequest.kind === 'resume' && resumeId === undefined) {
    const selection = await chooseResumeSession(await listResumeSessions());
    if (selection.kind === 'quit') {
      exit(0);
      return;
    }
    resumeId = selection.kind === 'resume' ? selection.sessionId : undefined;
  }
  let runtime = resumeId === undefined ? await createSession() : await resumeSession(resumeId);
  const llm = ctx.get('llm');
  const permissionPresets = ctx.get('permissionPresets');
  const commands = ctx.get('commands');

  // Debounced durability flush while a turn is running: a long or stuck turn
  // must be inspectable on disk without waiting for turn/end. The immediate
  // turn/end flush below remains the boundary checkpoint.
  let flushTimer = undefined;
  let flushing = false;
  const scheduleFlush = () => {
    if (flushTimer !== undefined || flushing) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      flushing = true;
      sessions
        .flush(runtime.handle.agent.session)
        .catch(error => {
          console.error(
            `rsh: session flush failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => {
          flushing = false;
        });
    }, 5000);
  };

  // Live append feed: forward this session's events to the UI and persist the
  // log at each turn boundary (fire-and-forget; flush is caller-owned).
  ctx.on('session/event', (session, event) => {
    if (session.id !== runtime.handle.agent.session.id) {
      return;
    }
    if (event.seq >= runtime.firstSeq) {
      if (event.type === 'turn/start') {
        runtime.hasStarted = true;
      }
      if (event.type === 'turn/end') {
        void sessions.flush(runtime.handle.agent.session).catch(error => {
          console.error(
            `rsh: session flush failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      } else if (
        event.type === 'turn/start' ||
        event.type === 'tool/call' ||
        event.type === 'tool/result'
      ) {
        scheduleFlush();
      }
    }
    forward(event);
  });

  // Assistant chunks deliberately stay out of the durable Session log until
  // the attempt settles. Bridge the agent-scoped live frames separately so
  // the composer shows text, tool calls, and provider-returned reasoning as
  // they arrive instead of only after the final assistant/message commit.
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (agent !== runtime.handle.agent) {
      return;
    }
    const event = liveChunkEvent(frame);
    if (event !== undefined) {
      forward(event);
    }
  });

  let app; // eslint-disable-line prefer-const
  let exited = false;
  const onExit = () => {
    if (exited) {
      return;
    }
    exited = true;
    // Final durability checkpoint before the harness exits.
    void sessions.flush(runtime.handle.agent.session).catch(() => {});
    if (app) {
      try {
        app.unmount();
      } catch {
        // The App already unmounted itself via useApp().exit().
      }
    }
    // The launcher's graceful path only sets process.exitCode and relies on
    // the event loop draining; file watchers can keep it alive after the UI
    // unmounts, so watchdog the process to release the terminal promptly.
    exit(0);
    setTimeout(() => {
      try {
        process.exit(0);
      } catch {
        // The process already exited via the graceful path.
      }
    }, 2000);
  };

  const controls = {
        listModels: async () => {
          const options = [];
          for (const provider of llm?.listProviders?.() ?? []) {
            for (const item of await llm.listModels(provider.id)) {
              options.push({ provider: provider.id, model: item.id, label: `${provider.id}/${item.id}`, selected: provider.id === runtime.selectionRef.current.provider && item.id === runtime.selectionRef.current.model });
            }
          }
          return options;
        },
        selectModel: async option => {
          const resolved = await llm.resolveCallConfig({ provider: option.provider, model: option.model });
          runtime.selectionRef.current = resolved;
          await defaultModel.saveSelection(resolved);
          return { route: `${resolved.provider}/${resolved.model}`, reasoning: resolved.reasoningEffort ?? 'provider default' };
        },
        listReasoning: async () => {
          const current = runtime.selectionRef.current;
          const reasoning = (await llm.resolveModelInfo(current.provider, current.model)).reasoning;
          return [{ label: 'Provider default' }, ...(reasoning?.efforts ?? []).map(effort => ({ label: effort.name, reasoningEffort: effort.id }))];
        },
        selectReasoning: async option => {
          const current = runtime.selectionRef.current;
          const resolved = await llm.resolveCallConfig({ provider: current.provider, model: current.model, ...(option.reasoningEffort === undefined ? {} : { reasoningEffort: option.reasoningEffort }) });
          runtime.selectionRef.current = resolved;
          await defaultModel.saveSelection(resolved);
          return { route: `${resolved.provider}/${resolved.model}`, reasoning: resolved.reasoningEffort ?? 'provider default' };
        },
        listMode: async () => {
          const presets = await agentPresets.list();
          const hasPlanMode = commands.find(runtime.handle.agent, 'plan') !== undefined;
          const toOption = (preset, group) => ({
            group,
            kind: 'preset',
            id: preset.id,
            label: `${preset.name ?? preset.id}${preset.description === undefined ? '' : ` — ${preset.description}`}${preset.broken === undefined ? '' : ` (unavailable: ${preset.broken})`}`,
            disabled: preset.broken !== undefined,
          });
          const ask = presets.find(preset => preset.id === 'ask');
          return [
            ...(ask === undefined ? [] : [toOption(ask, 'Ask mode')]),
            ...(hasPlanMode ? [
              { group: 'Current session behavior', kind: 'mode', label: 'Default mode', active: false },
              { group: 'Current session behavior', kind: 'mode', label: 'Plan mode', active: true },
            ] : []),
            ...presets.filter(preset => preset.id !== 'ask').map(preset => toOption(preset, 'Agent preset')),
          ];
        },
        selectMode: async option => {
          if (option.kind === 'preset') {
            if (option.disabled) {
              throw new Error(`${option.id} is unavailable`);
            }
            if (!runtime.hasStarted) {
              const preset = await agentPresets.select(runtime.handle.agent, option.id);
              runtime.preset = preset;
              return { preset };
            }
            const previous = runtime;
            runtime = await createSession(option.id);
            app.rerender(renderApp());
            await previous.handle.dispose();
            return { preset: runtime.preset, replaced: true };
          }
          const controller = new AbortController();
          const execution = await commands.execute(
            runtime.handle.agent,
            option.active ? '/plan' : '/plan off',
            [],
            controller.signal,
          );
          if (execution === undefined || execution.result.kind !== 'success') {
            throw new Error(execution?.result.text ?? 'Plan mode is unavailable');
          }
          // `plan/mode` is authoritative: the command can be queued while a
          // turn is active, so the UI updates only when that event commits.
          return {};
        },
        listPermissions: async () => permissionPresets.names.map(name => ({ label: name, value: name })),
        selectPermissions: async option => {
          const controller = new AbortController();
          await commands.execute(runtime.handle.agent, `/permission ${option.value}`, [], controller.signal);
          return option.label;
        },
      };

  const renderApp = () => React.createElement(App, {
    key: runtime.handle.agent.id,
    agent: runtime.handle.agent,
    onEvent: forward,
    onExit,
    onInterrupt: ({ keepInbox = true } = {}) => runtime.handle.agent.cancel(
      { kind: 'user' },
      { keepInbox },
    ),
    controls,
    firstSeq: runtime.firstSeq,
    initialEvents: runtime.initialEvents,
    model: `${runtime.selection.provider}/${runtime.selection.model}`,
    preset: runtime.preset,
    themeBg,
  });

  // exitOnCtrlC: false — the App owns Ctrl-C so it can exit the harness cleanly.
  app = render(renderApp(), { exitOnCtrlC: false });
}
