# Agent Note: RedSpark terminal rsh profile

Status: implemented

[English](2026-09-15-redspark-terminal-rsh-profile.md) | 中文

## Problem

RedSpark 已有浏览器、桌面端、headless、SDK 与 ACP 表层，但缺少面向 Shell 开发者的持久终端对话。再新增一个直接启动的 Node 可执行程序会绕开 profile 生命周期、组合包分层、安全组合、会话持久化，以及“`dsh` 是受支持 Node 应用启动器”的既有规则。

## Decision

`@deepseek-ai/dsh-rsh` 是一个内置组合包，由随发行版交付的 `rsh` profile 在 `@deepseek-ai/dsh-base` 之后挂载。`rsh-startup` 持有应用参数，`rsh-runner` 持有一个交互终端，以及它创建或恢复后得到的 Agent handle。它等待 Loader 结算，以当前默认模型创建带作用域的 Agent，通过 `ctx.sessionQuery` 观察初始不可变 Session，把已提交的 `session/event` 记录折叠为全屏对话记录，并将正常退出交给启动器，以便拥有该 handle 的 Cordis fiber 在整个应用 teardown 时释放它。

终端进入 Node raw mode 与 ANSI alternate screen。其输入框通过 `Ctrl+J` 接收多行输入，使用 `Agent.followup` 发送普通消息，通过 `ctx.commands` 调度已知斜杠命令，并让用户以 `Ctrl+C` 取消活动任务。它渲染持久化的用户、助手、工具、命令与审批记录；`agent/assistant-stream` 只提供瞬态且尚未结算的文本与推理。带作用域的 `approval/request` 应答器会为所属 Agent 排队请求，将当前请求结算为 `allowed-once` 或 `rejected`；不可用应答器仍由审批服务保持 fail-closed。

`Ctrl+K` 会打开方向键控制中心，供用户从已配置模型目录、当前路由的推理强度、计划／默认模式和既有权限预设中选择。RSH 通过 `ctx.llm` 校验模型选择，为下一次请求更新 Agent 作用域的选择引用，并尝试将有效选择保存为后续会话的默认值。既有 selection 监听器会将该引用接入提示词组装和请求路由，并写入常规模型变更提示。模式选择调用 `ctx.planMode`；权限选择调度 `/permission`，保留其审批策略注入与持久化 knob 事件。`Ctrl+P` 切换计划模式，而左右方向键、Home、End 和 Delete 可编辑输入框且不移动历史记录。

用户可见的 Windows `rsh` 命令是由 `scripts/install-rsh.ps1` 安装的 Shell shim；它使用检出目录的 host TypeScript 路径映射启动源码 `dsh` 入口，并传入 `--profile rsh`。它不会创建第二个 Node 应用或 package bin，保留调用位置的工作目录，并使 profile 组合保持唯一运行时路径。Shell 安装器拒绝覆盖已有命令，检出目录移动后必须重新运行。

`rsh resume` 会在任何 Agent 挂载前打开终端会话浏览器。它列出可恢复的顶层 RSH 持久化会话，默认筛选调用位置所在目录，从第一条用户消息派生可搜索标题，并允许切换到全部目录或按更新时间／创建时间排序。Enter 会通过 `agents.resume` 恢复高亮会话；Esc 新建会话，Ctrl+C 退出。`rsh resume <session-id>` 仍是适用于脚本和排障的确定性直接恢复形式。

该设计把 dsh-TUI 用作交互参考资料，尤其采用“实时模型 frame”与“从 Session 派生的对话记录”相分离的思路。它的 React 渲染器和私有 workspace 包没有被复制，因为它们的依赖图不是受支持的 RedSpark 运行时依赖。RSH 渲染器保持为小型 Node 原生终端所有者，因此 profile 不会新增第二个 Node 应用或未经证实的 UI 依赖。

## Alternatives considered

**原样 vendor dsh-TUI。** 未采用，因为它导出自己的 `dsh-tui` 和 `dst` Node bin，并依赖大量 React 渲染器与私有 `@dsh-std/*` workspace 依赖。这些依赖无法通过本仓库运行时闭包解析，也会引入第二个应用所有者。

**添加 `rsh` npm bin。** 未采用，因为 package-bin 入口会绕过仓库启动器规则。Shell shim 改为转发到 `dsh --profile rsh`。

**采用第三方终端渲染器。** 未采用，因为当前渲染器只需小型 raw-key 与 ANSI alternate-screen 约定，而新增渲染器会扩展运行时闭包，却不会删除既有兼容 UI 层。未来的渲染器依赖需要明确消费者与平台评估。

**让 Web UI 成为终端实现。** 未采用，因为浏览器传输与终端输入分别持有不同的生命周期和输出行为；终端使用者需要直接的 Session 与 Agent 驱动器。

## Verification

RSH startup provider 有一个真实 Loader 组合测试，覆盖提示词和 resume 参数解析及 help 行为。runner 测试驱动脚本化 raw 终端，断言全屏进入、持久对话记录渲染、控制中心模型切换、计划模式切换、Session flush、正常退出时的 teardown 交接、退出码、非 TTY 拒绝，以及通过终端选择的 `approval/request` 结果。model-control 测试固定 advisory 目录回退、精确路由校验、默认值持久化和 settings 写入失败。纯测试固定工具／命令／审批折叠，以及含实时输出、多行输入框、选择器与审批 frame 的渲染。内置 profile 仍由 profile-template 和启动器 help 检查覆盖。这些测试不证明真实提供方响应或人工终端布局评审。

## Consequences

开发者得到一个持久终端 TUI，它与其他 RedSpark 应用共享常规 base 工具、模型目录、安全策略和持久化 Session 格式。`rsh resume` 浏览器让用户无需记忆 ID 即可发现近期会话；恢复的会话会渲染保留的持久化对话记录，工具调用显示参数、输出与结算状态，审批请求需要明确的终端决定。模型与推理选择会成为下一次请求的精确路由，并在 settings provider 接受写入时保存为默认值；默认值写入失败时，终端保留已校验的实时选择并提示用户。鼠标交互与会话级审批授权仍在此 TUI 之外；IDE 协议集成仍由既有 ACP profile 负责。全局 Windows shim 绑定到检出目录，而不是可发布的 package 命令；它保留了启动器规则，但仓库移动后需要重新安装。
