# RedSpark 终端组合包

[English](README.md) | 中文

`@deepseek-ai/dsh-rsh` 提供 RedSpark Harness 的交互式 Ink 终端界面。

安装启动器后，使用 `rsh` 新建会话，或使用 `rsh resume` 选择并恢复历史会话。

该组合包构建于 `dsh-base` 之上：它用可持久化的终端会话界面替换一次性 headless runner，同时保留 Agent 预设、模型、推理强度、权限预设与流式助手输出。

开发时请在仓库根目录运行 `pnpm --filter @deepseek-ai/dsh-rsh test` 与 `pnpm --filter @deepseek-ai/dsh-rsh lint`。

不发布运行时 invariant companion：该组合包只挂载终端驱动，其使用的持久化 Agent、会话和预设关系分别由对应的包拥有并检查。

界面实现源自采用 MIT 许可证的 `gxinxing/deepseek-harness-tui` 项目。其许可证保存在 [LICENSE](LICENSE)，第三方依赖声明记录于仓库根目录的 [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md)。
