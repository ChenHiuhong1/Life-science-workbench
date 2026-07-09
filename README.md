<div align="center">

# Science Workbench

**面向科研流程的本地桌面 AI 工作台 · A local-first desktop AI workbench for research workflows**

[![Windows](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11)](https://github.com/ChenHiuhong1/Life-science-workbench/releases)
[![Release](https://img.shields.io/badge/release-v0.1.6-blue)](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

[下载安装包 · Download](#-下载与安装--installation) · [功能特性 · Features](#-功能特性--features) · [卸载 · Uninstall](#-卸载--uninstall)

</div>

---

> **中文说明请见下半部分。English version below.**
> This document is bilingual. Scroll down for the English version.

## 中文说明

Science Workbench 是一款**本地优先（local-first）**的桌面端科研 AI 工作台。它把大语言模型、证据化文献检索、生信分析、湿实验流程、文档写作与审查、HPC 远程作业等能力整合进一个 Windows 桌面应用，数据全部留在你自己的电脑上。

最终用户无需安装 Python、Node.js、Rust，也不需要命令行——只需从 GitHub Releases 下载安装包，像普通软件一样安装后从「开始菜单」或桌面快捷方式打开即可。

### ✨ 亮点

- **一键安装**：下载 `.exe` 安装包，双击安装，开箱即用。
- **本地数据**：项目、会话、星标文献、产物、API Key 全部存储在本地 `%APPDATA%\ScienceWorkbench`，不上传云端。
- **多模型适配**：兼容任何 OpenAI 接口规范的服务（GLM、DeepSeek、Kimi、OpenAI、本地 vLLM/Ollama 等）。
- **工作区随项目走**：每个项目绑定自己的研究文件夹，代码执行、产物、文件浏览都在该文件夹内进行，更换文件夹即时生效。
- **文档编写 + 一键审查**：内置 Markdown 文档编辑器，写完一键调用多领域审稿能力，输出按严重度排序的可执行修改清单。
- **代码审查侧栏**：生信/结构模块跑出的 Python/R 代码，默认只显示「+N/-M · Review」按钮，点击才在右侧抽屉打开完整 diff 审查，不挤占流式对话窗口。
- **项目级执行服务器**：建项目时可选填远程 Linux 服务器（IP / 端口 / 账号密码 / 工作目录），bio-analysis 与 structure-bio 可在远端跑计算；不填则默认本地沙箱。
- **内置技能库**：随程序内置 26 个科研 Agent 技能（蛋白质结构/设计/对接/嵌入、Nature 风格写作与润色、批判性评审、统计审查、知识图谱等），无需额外配置。

### 📥 下载与安装

1. 前往 [Releases 页面](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest)。
2. 在 **Assets** 中下载：
   - **推荐**：`ScienceWorkbench_0.1.6_x64-setup.exe`（NSIS 安装包，体积更小）
   - **备选**：`ScienceWorkbench_0.1.6_x64_en-US.msi`（MSI 安装包，适合企业部署）
3. 双击安装，按提示完成。
4. 从「开始菜单」或桌面快捷方式打开 **Science Workbench**。

> 首次打开后，请在应用的「设置」中填入你自己的 LLM API Key（默认指向 GLM，可改为 DeepSeek / Kimi / OpenAI 等）。

### 🧩 功能特性

| 模块 | 说明 |
|------|------|
| **Chat 聊天** | 项目级会话、流式响应、可中途停止生成、代码执行与产物追踪、会话可重命名 |
| **Study Design 研究设计** | 基于检索工具的文献语境、假设生成、研究方案规划 |
| **Bio-Analysis 生信分析** | Python / R 组学工作流、图表产物、环境快照、文献支撑的方法选择 |
| **Structure-Bio 结构生物学** | 蛋白结构预测、蛋白设计、对接、序列嵌入与 PDB/mmCIF/SDF/MOL2 结构 3D 预览 |
| **Protocol 实验流程** | 湿实验流程构建、问答、数据处理与证据化参数核查 |
| **Reviewer 评审** | 多领域评审清单、引用/证据核查与文本修订 |
| **Document 文档** | Markdown 文档编辑器（左编辑右预览），一键调用多领域审查，输出按严重度排序的修改清单 |
| **Module 模块** | 工作流抽取、用户引导式修订、正式模块封装 |
| **HPC 高性能计算** | SSH 连接、远程命令、上传/下载、调度器队列 |

文献检索不再作为独立 agent 展示；需要证据时，Chat、Study Design、Bio-Analysis、Structure-Bio、Protocol、Reviewer 和 Document 会在各自会话内调用 `search_literature`，检索结果归属当前会话。

### 🧠 每个 Agent 内置的技能

每个 agent 启动时会加载一组「全局约束技能」（harness 执行循环、证据/风险纪律、agent 隔离、目录治理、方法来源核查、自我觉察等），再加上各自专属的领域技能。下表列出每个 agent 的专属技能（全局约束技能对所有 agent 生效，不再重复）。

| Agent | 内置专属技能（随程序加载） |
|-------|-----------------------------|
| **Chat** | 无专属技能（通用对话 + 代码执行 + 文献检索） |
| **Study Design 研究设计** | scientific-brainstorming（假设生成/研究设计流程）、nature-academic-search（文献检索纪律）、literature-review（多论文综述）、knowledge-organization（证据图/假设组织）、mind-map（研究路线思维导图）、notebook-builder（可更新笔记本）、knowledge-graph-builder（知识图谱）、critical-thinking-review（CASP/Cochrane/GRADE 批判性评审） |
| **Bio-Analysis 生信分析** | nature-figure（Nature 风格图表纪律）+ bioinformatics / superpowers 约束组 |
| **Structure-Bio 结构生物学** | protein-structure（AlphaFold2/OpenFold3/Boltz/Chai-1/ESMFold2）、protein-design（ProteinMPNN/LigandMPNN/SolubleMPNN）、protein-docking（DiffDock 等）、protein-embedding（fair-esm2）、nature-figure（图表纪律） |
| **Protocol 实验流程** | protocols 约束组（湿实验流程、对照设计、危险操作警示） |
| **Reviewer 评审** | nature-reviewer（稿件/图表/流程/研究设计评审）、nature-writing（科学写作结构）、nature-polishing（学术润色）、nature-response（审稿回复信）、statistical-analysis（统计审查）+ bioinformatics/protocols 约束组 |
| **Document 文档** | critical-thinking-review（批判性审查）+ nature / protocols 约束组（IMRaD 结构、方法引用） |
| **Module 模块** | module-workflow-packager（工作流抽取/协商/封装为模块规范） |

> 全局约束技能（对所有 agent 生效）：harness-core（感知-规划-执行-验证循环）、evidence-risk-discipline（证据/不确定性/风险纪律）、agent-output-contracts（产物与交接规范）、self-awareness（目标/范围/漂移自检）、agent-isolation（模块间隔离）、project-directory-governance（目录治理）、algorithm-method-sourcing（算法/方法必须溯源到已验证包或文献）。
>
> 用户也可在任意会话用 `/skill <名字>` 或 `$<名字>` 临时调用某个技能（仅当回合生效）。

### 🤖 Codex 接入规划

Science Workbench 的常规 agent 仍使用「模型提供商 / 模型号 / 上下文窗口 / 思考强度」作为普通 LLM 配置；未来接入 Codex 时，应作为独立的 **Codex Operator** 运行面，而不是直接替换现有 agent 设置。

- **凭据分离**：Codex 可通过 ChatGPT 登录使用订阅权益，也可通过 API Key 使用按量计费；没有 API Key 额度时，应优先走 ChatGPT 登录 / Codex 账户会话。
- **配置分离**：普通 LLM 的 `provider`、`model`、`context_window`、`reasoning` 与 Codex Operator 的 `model`、`model_reasoning_effort`、sandbox、approval policy 分开保存，避免切换 GLM / DeepSeek / Kimi / OpenAI 时串配置。
- **模型号按官方接口保存**：Codex 侧保存官方 Codex/API model id（例如 Codex 文档中的 `gpt-5.5` 一类 slug）和 reasoning effort；ChatGPT 网页端显示的 `Pro`、`extended` 等模式标签不应直接当作本地可调用模型号，除非 OpenAI 在 Codex/API 中暴露了对应官方 slug。
- **集成边界**：若将来让 Science Workbench 暴露为 ChatGPT App / MCP 工具，网页端模型与思考模式由 ChatGPT 会话选择；本应用负责提供工具、文件、产物和权限边界。

### 📂 工作区与数据

每个项目可绑定一个研究文件夹。绑定后：

- agent 执行的 Python / R 代码在项目根目录运行，生成的图/数据会被收集到 `artifacts\<module>\<session>\` 下；
- 文件浏览器默认打开该项目文件夹；
- 产物面板展示该项目的产物；
- 在项目侧栏点齿轮图标可随时更换文件夹，工作区立即跟随切换。

未绑定文件夹的项目回退到全局工作区 `%APPDATA%\ScienceWorkbench\workspaces`。

数据存储位置（安装版）：

```
%APPDATA%\ScienceWorkbench
```

| 路径 | 内容 |
|------|------|
| `.env` | 模型、API Key、运行时设置 |
| `data\app.db` | 项目、会话、消息、星标文献、HPC 连接（SQLite） |
| `data\artifacts\` | 全局回退的图表/表格产物 |
| `logs\app.log` | 后端日志 |
| `workspaces\` | 默认项目工作区 |

### 🗑 卸载

NSIS 安装包自带卸载程序。卸载方式任选其一：

- **设置 → 应用 → 已安装的应用 → ScienceWorkbench → 卸载**，或
- 运行安装目录下的 `uninstall.exe`。

卸载会自动清除：安装目录（含程序与 sidecar）、开始菜单与桌面快捷方式、注册表卸载项。

> 卸载程序**故意保留**用户数据 `%APPDATA%\ScienceWorkbench`（保留你的 API Key、数据库、产物），方便升级或重装。如需彻底重置，请在卸载后手动删除该文件夹。

### 🔒 隐私

- 所有数据（项目、会话、文献、产物、API Key）仅存储在本地，不上传到任何 Science Workbench 服务器。
- 应用只在以下情况访问网络：调用你配置的 LLM API、检索公开学术数据库（PubMed 等）、连接你指定的 HPC。
- LLM 请求直接从你的电脑发往你选择的模型服务商，本应用不中转、不存储你的密钥。

### 🛠️ 开发与源码

普通用户直接下载安装包即可，无需关心源码。如果你想在本地运行/调试、二次开发，或自行打包，仓库里已包含全部所需文件：

- **运行桌面开发版**：`start.bat`（自动装依赖、起后端 + 前端、打开 Tauri 桌面窗口）
- **仅浏览器 UI 预览**：`start_web.bat`
- **自行打包 Windows 安装包**：`build_windows.bat`
- 维护者文档：`PACKAGING_WINDOWS.md`（打包细节）、`RELEASE_CHECKLIST.md`（发布检查清单）

开发环境需要 Python 3.12、Node.js 20.19+/22.12+、Rust stable。详细说明见 `PACKAGING_WINDOWS.md`。GitHub Release 的 **Source code (zip)** 就是这份完整源码，解压后即可按上述脚本运行与修改。

### License

MIT License © 2026 Science Workbench Contributors

---

## English

Science Workbench is a **local-first** desktop AI workbench for research workflows. It unifies a large language model, evidence-backed literature search, bioinformatics analysis, wet-lab protocols, document writing with review, and HPC remote jobs into a single Windows desktop application — with all data kept on your own machine.

End users never need to install Python, Node.js, or Rust, nor touch a command line. They simply download the installer from GitHub Releases, install it like any normal app, and open **Science Workbench** from the Start menu or a desktop shortcut.

### ✨ Highlights

- **One-click install**: download the `.exe`, double-click, done.
- **Local data**: projects, sessions, starred literature, artifacts, and API keys all live in `%APPDATA%\ScienceWorkbench` — nothing is uploaded to the cloud.
- **Multi-provider**: works with any OpenAI-compatible API (GLM, DeepSeek, Kimi, OpenAI, local vLLM/Ollama, etc.).
- **Workspace follows the project**: each project binds its own research folder; code execution, artifacts, and file browsing all happen inside that folder, and switching the folder takes effect immediately.
- **Document writing with one-click review**: a built-in Markdown editor lets you draft a manuscript/protocol/proposal, then run a multi-domain review that returns a severity-sorted, actionable revision checklist.
- **Code-review side panel**: Python/R code run by the bio/structure modules shows only a compact "+N/-M · Review" button by default; click it to open the full diff in a right-side drawer, keeping the streaming conversation window uncluttered.
- **Per-project execution server**: when creating a project you can optionally fill in a remote Linux server (IP / port / username / password / working directory); bio-analysis and structure-bio can then run compute remotely. Leave it blank to run in the local sandbox.
- **Bundled skills**: ships with 26 research-oriented agent skills (protein structure/design/docking/embedding, Nature-style writing & polishing, critical review, statistical review, knowledge graph, etc.) — no extra setup required.

### 📥 Download & Installation

1. Go to the [Releases page](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest).
2. From **Assets**, download:
   - **Recommended**: `ScienceWorkbench_0.1.6_x64-setup.exe` (NSIS installer, smaller).
   - **Alternative**: `ScienceWorkbench_0.1.6_x64_en-US.msi` (MSI installer, suited for enterprise deployment).
3. Double-click to install and follow the wizard.
4. Open **Science Workbench** from the Start menu or desktop shortcut.

> On first launch, open **Settings** inside the app and fill in your own LLM API key. The default points to GLM; you can switch to DeepSeek / Kimi / OpenAI / a local model.

### 🧩 Features

| Module | Description |
|--------|-------------|
| **Chat** | Project-scoped sessions, streaming responses, stop generation mid-stream, code execution, artifact tracking, renameable sessions |
| **Study Design** | Evidence-grounded context, hypothesis generation, proposal planning |
| **Bio-Analysis** | Python / R omics workflows, figure artifacts, environment snapshots, evidence-backed method choices |
| **Structure-Bio** | Protein structure prediction, protein design, docking, sequence embeddings, and 3D previews for PDB/mmCIF/SDF/MOL2 structure files |
| **Protocol** | Wet-lab protocol building, Q&A, data processing, parameter evidence checks |
| **Reviewer** | Multi-domain review checklists, citation/evidence checks, and text revision |
| **Document** | Markdown editor (edit left, preview right) with one-click multi-domain review returning a severity-sorted revision checklist |
| **Module** | Workflow extraction, user-guided revision, formal module packaging |
| **HPC** | SSH connections, remote commands, upload/download, scheduler queues |

Literature search is no longer a standalone agent. When evidence is needed,
Chat, Study Design, Bio-Analysis, Structure-Bio, Protocol, Reviewer, and Document call
`search_literature` inside the active session so sources stay attached to the
work that requested them.

### 🧠 Skills loaded inside each Agent

Every agent loads a set of **global constraint skills** at startup (the harness execution loop, evidence/risk discipline, agent isolation, directory governance, method sourcing, self-awareness, …) on top of its own domain skills. The table below lists each agent's domain-specific skills (global constraints apply to all agents and are omitted from the table).

| Agent | Domain skills loaded (bundled) |
|-------|--------------------------------|
| **Chat** | none (general chat + code execution + literature search) |
| **Study Design** | scientific-brainstorming (hypothesis/study-design flow), nature-academic-search (literature-search discipline), literature-review (multi-paper synthesis), knowledge-organization (evidence/hypothesis maps), mind-map (research-route mind maps), notebook-builder (updateable notebooks), knowledge-graph-builder (knowledge graphs), critical-thinking-review (CASP/Cochrane/GRADE appraisal) |
| **Bio-Analysis** | nature-figure (Nature-style figure discipline) + bioinformatics / superpowers constraint groups |
| **Structure-Bio** | protein-structure (AlphaFold2/OpenFold3/Boltz/Chai-1/ESMFold2), protein-design (ProteinMPNN/LigandMPNN/SolubleMPNN), protein-docking (DiffDock et al.), protein-embedding (fair-esm2), nature-figure (figure discipline) |
| **Protocol** | protocols constraint group (wet-lab workflows, control design, hazard warnings) |
| **Reviewer** | nature-reviewer (manuscript/figure/protocol/study review), nature-writing (scientific writing structure), nature-polishing (academic polishing), nature-response (rebuttal letters), statistical-analysis (statistical review) + bioinformatics/protocols groups |
| **Document** | critical-thinking-review (critical appraisal) + nature / protocols groups (IMRaD structure, method citation) |
| **Module** | module-workflow-packager (workflow extraction/negotiation/packaging into module specs) |

> Global constraint skills (apply to every agent): harness-core (perceive-plan-act-verify loop), evidence-risk-discipline (evidence/uncertainty/risk discipline), agent-output-contracts (artifact & handoff contracts), self-awareness (goal/scope/drift self-check), agent-isolation (cross-module isolation), project-directory-governance (directory governance), algorithm-method-sourcing (algorithms/methods must trace to a verified package or paper).
>
> You can also invoke any skill on demand in a session with `/skill <name>` or `$<name>` (applies to that turn only).

### 🤖 Codex Integration Plan

Science Workbench's regular agents continue to use the normal LLM settings surface: provider, model id, context window, and reasoning level. A future Codex integration should be a separate **Codex Operator** surface, not a silent replacement for the existing agent settings.

- **Credential separation**: Codex can use ChatGPT sign-in for subscription access or an API key for usage-based access. If the user does not have API-key quota, prefer the ChatGPT sign-in / Codex session path.
- **Settings separation**: keep regular LLM `provider`, `model`, `context_window`, and `reasoning` separate from Codex Operator `model`, `model_reasoning_effort`, sandbox, and approval policy, so switching between GLM / DeepSeek / Kimi / OpenAI cannot leak settings across providers.
- **Official model ids only**: store official Codex/API model ids on the Codex side, such as documented `gpt-5.5`-style slugs, plus reasoning effort. ChatGPT web labels such as `Pro` or `extended` are UI/entitlement mode labels and should not be treated as locally callable model ids unless OpenAI exposes a matching official Codex/API slug.
- **Integration boundary**: if Science Workbench is later exposed as a ChatGPT App or MCP tool surface, the web model and thinking mode are selected by the ChatGPT conversation; this app provides tools, files, artifacts, and permission boundaries.

### 📂 Workspace & Data

Each project can bind a research folder. Once bound:

- Python / R code run by agents executes from the project root; generated figures and data are collected under `artifacts\<module>\<session>\`;
- the file browser opens at the project folder by default;
- the artifact panel shows that project's artifacts;
- the gear icon on a project lets you switch folders at any time, and the workspace follows instantly.

Projects without a bound folder fall back to the global workspace `%APPDATA%\ScienceWorkbench\workspaces`.

Installed builds use a dedicated local data directory:

```
%APPDATA%\ScienceWorkbench
```

| Path | Contents |
|------|----------|
| `.env` | Model, API key, runtime settings |
| `data\app.db` | Projects, sessions, messages, starred literature, HPC connections (SQLite) |
| `data\artifacts\` | Global fallback for figures/tables |
| `logs\app.log` | Backend logs |
| `workspaces\` | Default project workspaces |

### 🗑 Uninstall

The NSIS installer ships its own uninstaller. Either:

- open **Settings → Apps → Installed apps → ScienceWorkbench → Uninstall**, or
- run `uninstall.exe` in the install directory.

Uninstalling removes: the install directory (app + sidecar), Start menu and desktop shortcuts, and the registry uninstall entry.

> The uninstaller **intentionally keeps** user data at `%APPDATA%\ScienceWorkbench` (your API key, database, artifacts) so upgrades or reinstalls preserve your work. To fully reset, delete that folder manually after uninstalling.

### 🔒 Privacy

- All data (projects, sessions, starred literature, artifacts, API keys) is stored locally only; nothing is uploaded to any Science Workbench server.
- The app accesses the network only to: call your configured LLM API, query public academic databases (PubMed, etc.), and connect to HPC hosts you specify.
- LLM requests go directly from your machine to your chosen model provider. This app does not relay or store your keys.

### 🛠️ Development & Source Code

End users just download the installer — no source code needed. If you want to run/debug locally, extend the app, or build installers yourself, the repository already contains everything required:

- **Run the desktop dev build**: `start.bat` (installs deps, starts backend + frontend, opens the Tauri desktop window)
- **Browser-only UI preview**: `start_web.bat`
- **Build Windows installers yourself**: `build_windows.bat`
- Maintainer docs: `PACKAGING_WINDOWS.md` (packaging details), `RELEASE_CHECKLIST.md` (release checklist)

Development requires Python 3.12, Node.js 20.19+/22.12+, and Rust stable. See `PACKAGING_WINDOWS.md` for details. The **Source code (zip)** on each GitHub Release is this complete source tree — unzip it and run the scripts above to modify and rebuild.

### License

MIT License © 2026 Science Workbench Contributors

---

<div align="center">

**⭐ 如果这个项目对你有帮助，欢迎 Star / If this project helps you, please consider starring it.**

</div>
