# RedSpark terminal bundle

English | [中文](README.zh.md)

`@deepseek-ai/dsh-rsh` provides RedSpark Harness's interactive Ink terminal UI.

Run the installed launcher with `rsh` to start a session, or `rsh resume` to select and resume a previous session.

The bundle is composed over `dsh-base`. It replaces the one-shot headless runner with a durable session UI while retaining the selected agent preset, model, reasoning effort, permission preset, and streamed assistant output.

For development, run `pnpm --filter @deepseek-ai/dsh-rsh test` and `pnpm --filter @deepseek-ai/dsh-rsh lint` from the repository root.

No runtime invariant companion is published: this bundle mounts a terminal driver, while the durable Agent, session, and preset relationships it consumes are owned and checked by their respective packages.

The UI implementation originated from the MIT-licensed `gxinxing/deepseek-harness-tui` project. Its license is preserved in [LICENSE](LICENSE); third-party package notices are recorded in the repository-level [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md).
