<div align="center">

# Science Workbench

**面向科研流程的本地桌面 AI 工作台 · A local-first desktop AI workbench for research workflows**

[![Windows](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11)](https://github.com/ChenHiuhong1/Life-science-workbench/releases)
[![Release](https://img.shields.io/badge/release-v0.1.3-blue)](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

[下载安装包 · Download](#-下载与安装--installation) · [功能特性 · Features](#-功能特性--features) · [卸载 · Uninstall](#-卸载--uninstall)

</div>

---

> **中文说明请见下半部分。English version below.**
> This document is bilingual. Scroll down for the English version.

## 中文说明

Science Workbench 是一款**本地优先（local-first）**的桌面端科研 AI 工作台。它把大语言模型、文献检索、生信分析、湿实验流程、文档写作与审查、HPC 远程作业等能力整合进一个 Windows 桌面应用，数据全部留在你自己的电脑上。

最终用户无需安装 Python、Node.js、Rust，也不需要命令行——只需从 GitHub Releases 下载安装包，像普通软件一样安装后从「开始菜单」或桌面快捷方式打开即可。

### ✨ 亮点

- **一键安装**：下载 `.exe` 安装包，双击安装，开箱即用。
- **本地数据**：项目、会话、文献、产物、API Key 全部存储在本地 `%APPDATA%\ScienceWorkbench`，不上传云端。
- **多模型适配**：兼容任何 OpenAI 接口规范的服务（GLM、DeepSeek、Kimi、OpenAI、本地 vLLM/Ollama 等）。
- **工作区随项目走**：每个项目绑定自己的研究文件夹，代码执行、产物、文件浏览都在该文件夹内进行，更换文件夹即时生效。
- **文档编写 + 一键审查**：内置 Markdown 文档编辑器，写完一键调用多领域审稿能力，输出按严重度排序的可执行修改清单。
- **内置技能库**：随程序内置 18+ 个科研 Agent 技能（蛋白质结构/设计/对接/嵌入、Nature 风格写作、批判性评审、知识图谱等），无需额外配置。

### 📥 下载与安装

1. 前往 [Releases 页面](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest)。
2. 在 **Assets** 中下载：
   - **推荐**：`ScienceWorkbench_0.1.3_x64-setup.exe`（NSIS 安装包，体积更小）
   - **备选**：`ScienceWorkbench_0.1.3_x64_en-US.msi`（MSI 安装包，适合企业部署）
3. 双击安装，按提示完成。
4. 从「开始菜单」或桌面快捷方式打开 **Science Workbench**。

> 首次打开后，请在应用的「设置」中填入你自己的 LLM API Key（默认指向 GLM，可改为 DeepSeek / Kimi / OpenAI 等）。

### 🧩 功能特性

| 模块 | 说明 |
|------|------|
| **Chat 聊天** | 项目级会话、流式响应、可中途停止生成、代码执行与产物追踪、会话可重命名 |
| **Literature 文献** | 聚合检索 PubMed、arXiv、CrossRef、Semantic Scholar |
| **Study Design 研究设计** | 基于文献的头脑风暴、假设生成、研究方案规划 |
| **Bio-Analysis 生信分析** | Python / R 工作流、图表产物、环境快照 |
| **Protocol 实验流程** | 湿实验流程构建、问答与数据处理 |
| **Reviewer 评审** | 多领域评审清单与文本修订 |
| **Document 文档** | Markdown 文档编辑器（左编辑右预览），一键调用多领域审查，输出按严重度排序的修改清单 |
| **Module 模块** | 工作流抽取、用户引导式修订、正式模块封装 |
| **HPC 高性能计算** | SSH 连接、远程命令、上传/下载、调度器队列 |

### 📂 工作区与数据

每个项目可绑定一个研究文件夹。绑定后：

- agent 执行的 Python / R 代码在该文件夹的 `.sw_artifacts\<session>` 子目录下运行，生成的图/数据直接落到项目里；
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

### 🙏 贡献者

- **[GLM (智谱 / Z.ai)](https://www.zhipuai.cn/)** — 本项目由 GLM 大模型协作开发，研究工作流、技能与文档的生成得到其辅助。Science Workbench 默认也使用 GLM 系列模型作为后端。

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

Science Workbench is a **local-first** desktop AI workbench for research workflows. It unifies a large language model, literature search, bioinformatics analysis, wet-lab protocols, document writing with review, and HPC remote jobs into a single Windows desktop application — with all data kept on your own machine.

End users never need to install Python, Node.js, or Rust, nor touch a command line. They simply download the installer from GitHub Releases, install it like any normal app, and open **Science Workbench** from the Start menu or a desktop shortcut.

### ✨ Highlights

- **One-click install**: download the `.exe`, double-click, done.
- **Local data**: projects, sessions, literature, artifacts, and API keys all live in `%APPDATA%\ScienceWorkbench` — nothing is uploaded to the cloud.
- **Multi-provider**: works with any OpenAI-compatible API (GLM, DeepSeek, Kimi, OpenAI, local vLLM/Ollama, etc.).
- **Workspace follows the project**: each project binds its own research folder; code execution, artifacts, and file browsing all happen inside that folder, and switching the folder takes effect immediately.
- **Document writing with one-click review**: a built-in Markdown editor lets you draft a manuscript/protocol/proposal, then run a multi-domain review that returns a severity-sorted, actionable revision checklist.
- **Bundled skills**: ships with 18+ research-oriented agent skills (protein structure/design/docking/embedding, Nature-style writing, critical review, knowledge graph, etc.) — no extra setup required.

### 📥 Download & Installation

1. Go to the [Releases page](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest).
2. From **Assets**, download:
   - **Recommended**: `ScienceWorkbench_0.1.3_x64-setup.exe` (NSIS installer, smaller).
   - **Alternative**: `ScienceWorkbench_0.1.3_x64_en-US.msi` (MSI installer, suited for enterprise deployment).
3. Double-click to install and follow the wizard.
4. Open **Science Workbench** from the Start menu or desktop shortcut.

> On first launch, open **Settings** inside the app and fill in your own LLM API key. The default points to GLM; you can switch to DeepSeek / Kimi / OpenAI / a local model.

### 🧩 Features

| Module | Description |
|--------|-------------|
| **Chat** | Project-scoped sessions, streaming responses, stop generation mid-stream, code execution, artifact tracking, renameable sessions |
| **Literature** | Aggregated search across PubMed, arXiv, CrossRef, Semantic Scholar |
| **Study Design** | Literature-grounded brainstorming, hypothesis generation, proposal planning |
| **Bio-Analysis** | Python / R workflows, figure artifacts, environment snapshots |
| **Protocol** | Wet-lab protocol building, Q&A, data processing |
| **Reviewer** | Multi-domain review checklists and text revision |
| **Document** | Markdown editor (edit left, preview right) with one-click multi-domain review returning a severity-sorted revision checklist |
| **Module** | Workflow extraction, user-guided revision, formal module packaging |
| **HPC** | SSH connections, remote commands, upload/download, scheduler queues |

### 📂 Workspace & Data

Each project can bind a research folder. Once bound:

- Python / R code run by agents executes inside that folder's `.sw_artifacts\<session>` subdirectory, so figures and data land directly in the project;
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

- All data (projects, sessions, literature, artifacts, API keys) is stored locally only; nothing is uploaded to any Science Workbench server.
- The app accesses the network only to: call your configured LLM API, query public academic databases (PubMed, etc.), and connect to HPC hosts you specify.
- LLM requests go directly from your machine to your chosen model provider. This app does not relay or store your keys.

### 🙏 Contributors

- **[GLM (Zhipu / Z.ai)](https://www.zhipuai.cn/)** — this project was built in collaboration with the GLM large language model, which assisted in producing research workflows, skills, and documentation. Science Workbench also defaults to the GLM model family as its backend.

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
