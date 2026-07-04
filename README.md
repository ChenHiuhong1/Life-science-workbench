<div align="center">

# Science Workbench

**面向科研流程的本地桌面 AI 工作台 · A local-first desktop AI workbench for research workflows**

[![Windows](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11)](https://github.com/ChenHiuhong1/Life-science-workbench/releases)
[![Release](https://img.shields.io/badge/release-v0.1.0-blue)](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

[下载安装包 · Download](#-下载与安装--installation) · [功能特性 · Features](#-功能特性--features) · [开发指南 · Development](#-开发指南--development) · [发布流程 · Release](#-发布流程--release)

</div>

---

> **中文说明请见下半部分。English version below.**
> This document is bilingual. Scroll down for the English version.

## 中文说明

Science Workbench 是一款**本地优先（local-first）**的桌面端科研 AI 工作台。它把大语言模型、文献检索、生信分析、湿实验流程、HPC 远程作业等能力整合进一个 Windows 桌面应用，数据全部留在你自己的电脑上。

最终用户无需安装 Python、Node.js、Rust，也不需要命令行——只需从 GitHub Releases 下载安装包，像普通软件一样安装后从「开始菜单」或桌面快捷方式打开即可。

### ✨ 亮点

- **一键安装**：下载 `.exe` 安装包，双击安装，开箱即用。
- **本地数据**：项目、会话、文献、产物、API Key 全部存储在本地 `%APPDATA%\ScienceWorkbench`，不上传云端。
- **多模型适配**：兼容任何 OpenAI 接口规范的服务（GLM、DeepSeek、Kimi、OpenAI、本地 vLLM/Ollama 等）。
- **科研全流程**：聊天助手、文献检索、研究设计、生信分析、实验流程、同行评审、模块封装、HPC 远程作业，一个应用覆盖。
- **内置技能库**：随程序内置 18+ 个科研 Agent 技能（蛋白质结构/设计/对接/嵌入、Nature 风格写作、批判性评审、知识图谱等），无需额外配置。

### 📥 下载与安装

1. 前往 [Releases 页面](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest)。
2. 在 **Assets** 中下载：
   - **推荐**：`ScienceWorkbench_0.1.0_x64-setup.exe`（NSIS 安装包，体积更小）
   - **备选**：`ScienceWorkbench_0.1.0_x64_en-US.msi`（MSI 安装包，适合企业部署）
3. 双击安装，按提示完成。
4. 从「开始菜单」或桌面快捷方式打开 **Science Workbench**。

> 首次打开后，请在应用的「设置」中填入你自己的 LLM API Key（默认指向 GLM，可改为 DeepSeek / Kimi / OpenAI 等）。

### 🧩 功能特性

| 模块 | 说明 |
|------|------|
| **Chat 聊天** | 项目级会话、流式响应、可中途停止生成、代码执行与产物追踪 |
| **Literature 文献** | 聚合检索 PubMed、arXiv、CrossRef、Semantic Scholar |
| **Study Design 研究设计** | 基于文献的头脑风暴、假设生成、研究方案规划 |
| **Bio-Analysis 生信分析** | Python / R 工作流、图表产物、环境快照 |
| **Protocol 实验流程** | 湿实验流程构建、问答与数据处理 |
| **Reviewer 评审** | 多领域评审清单与文本修订 |
| **Module 模块** | 工作流抽取、用户引导式修订、正式模块封装 |
| **HPC 高性能计算** | SSH 连接、远程命令、上传/下载、调度器队列 |

### 📂 数据存储位置

安装版使用独立的本地数据目录：

```
%APPDATA%\ScienceWorkbench
```

| 路径 | 内容 |
|------|------|
| `.env` | 模型、API Key、运行时设置 |
| `data\app.db` | 项目、会话、消息、星标文献、HPC 连接（SQLite） |
| `data\artifacts\` | 生成的图表、表格等产物 |
| `logs\app.log` | 后端日志 |
| `workspaces\` | 默认项目工作区 |

项目也可以指向任意外部研究目录（数据盘、项目文件夹、同步盘等）。

### 🛠️ 开发指南

桌面端开发需要：

- **Python 3.12**
- **Node.js 20.19+** 或 **22.12+**
- **Rust stable / Cargo**

启动桌面开发环境：

```bat
cd /d D:\science_application
start.bat
```

`start.bat` 会在后台启动后端与前端开发服务器，然后用 `cargo run` 打开 Tauri 桌面窗口（**不打开浏览器**）。

仅做浏览器 UI 预览测试时：

```bat
start_web.bat
```

> 浏览器地址 `http://127.0.0.1:5173` **仅供预发布 UI 验证**，不是最终用户入口。

### 📦 发布流程

维护者发布新版本：

```bat
git tag v0.1.0
git push origin v0.1.0
```

推送 `v*` 开头的 tag 后，GitHub Actions（`.github/workflows/build-desktop.yml`）会自动：

1. 在 `windows-latest` 上准备 Python 3.12、Node.js 22、Rust。
2. 用 PyInstaller 把 FastAPI 后端打包成 `science-backend.exe`，作为 Tauri sidecar。
3. 构建前端产物。
4. 用 `@tauri-apps/cli` 生成 `.exe`（NSIS）与 `.msi` 安装包。
5. 创建 GitHub Release 并把安装包作为资产上传。

本地手动构建安装包：

```bat
cd /d D:\science_application
build_windows.bat
```

构建产物位于 `src-tauri\target\release\bundle\`。

### 📚 内置技能

开源版本不依赖任何私有的本地技能文件夹，核心 Agent 技能随程序内置在 `backend\bundled_skills\`，涵盖：harness 行为、自我认知、Agent 隔离、项目目录治理、算法/包优先溯源、蛋白质结构/设计/对接/嵌入、Nature 风格响应、批判性评审、研究设计知识组织、条件式 notebook/知识图谱生成、Module 工作流封装等。

可选的用户自定义技能仍可放在：

```
%USERPROFILE%\.agents\skills
```

或设置环境变量 `SCIENCE_WORKBENCH_USER_SKILLS_DIR`。

### 🔒 隐私

- 所有数据（项目、会话、文献、产物、API Key）仅存储在本地，不上传到任何 Science Workbench 服务器。
- 应用只在以下情况访问网络：调用你配置的 LLM API、检索公开学术数据库（PubMed 等）、连接你指定的 HPC。
- LLM 请求直接从你的电脑发往你选择的模型服务商，本应用不中转、不存储你的密钥。

### 📋 技术栈

| 层 | 技术 |
|----|------|
| 桌面外壳 | Tauri 2（Rust） |
| 后端 | FastAPI + Uvicorn（Python 3.12） |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + Zustand |
| 数据 | SQLite（aiosqlite / SQLAlchemy） |
| 打包 | PyInstaller（后端 sidecar）+ Tauri bundler（安装包） |

### License

MIT License © 2026 Science Workbench Contributors

---

## English

Science Workbench is a **local-first** desktop AI workbench for research workflows. It unifies a large language model, literature search, bioinformatics analysis, wet-lab protocols, and HPC remote jobs into a single Windows desktop application — with all data kept on your own machine.

End users never need to install Python, Node.js, or Rust, nor touch a command line. They simply download the installer from GitHub Releases, install it like any normal app, and open **Science Workbench** from the Start menu or a desktop shortcut.

### ✨ Highlights

- **One-click install**: download the `.exe`, double-click, done.
- **Local data**: projects, sessions, literature, artifacts, and API keys all live in `%APPDATA%\ScienceWorkbench` — nothing is uploaded to the cloud.
- **Multi-provider**: works with any OpenAI-compatible API (GLM, DeepSeek, Kimi, OpenAI, local vLLM/Ollama, etc.).
- **Full research pipeline**: chat assistant, literature search, study design, bio-analysis, protocols, peer review, module packaging, and HPC remote jobs — all in one app.
- **Bundled skills**: ships with 18+ research-oriented agent skills (protein structure/design/docking/embedding, Nature-style writing, critical review, knowledge graph, etc.) — no extra setup required.

### 📥 Download & Installation

1. Go to the [Releases page](https://github.com/ChenHiuhong1/Life-science-workbench/releases/latest).
2. From **Assets**, download:
   - **Recommended**: `ScienceWorkbench_0.1.0_x64-setup.exe` (NSIS installer, smaller).
   - **Alternative**: `ScienceWorkbench_0.1.0_x64_en-US.msi` (MSI installer, suited for enterprise deployment).
3. Double-click to install and follow the wizard.
4. Open **Science Workbench** from the Start menu or desktop shortcut.

> On first launch, open **Settings** inside the app and fill in your own LLM API key. The default points to GLM; you can switch to DeepSeek / Kimi / OpenAI / a local model.

### 🧩 Features

| Module | Description |
|--------|-------------|
| **Chat** | Project-scoped sessions, streaming responses, stop generation mid-stream, code execution, artifact tracking |
| **Literature** | Aggregated search across PubMed, arXiv, CrossRef, Semantic Scholar |
| **Study Design** | Literature-grounded brainstorming, hypothesis generation, proposal planning |
| **Bio-Analysis** | Python / R workflows, figure artifacts, environment snapshots |
| **Protocol** | Wet-lab protocol building, Q&A, data processing |
| **Reviewer** | Multi-domain review checklists and text revision |
| **Module** | Workflow extraction, user-guided revision, formal module packaging |
| **HPC** | SSH connections, remote commands, upload/download, scheduler queues |

### 📂 Data Location

Installed builds use a dedicated local data directory:

```
%APPDATA%\ScienceWorkbench
```

| Path | Contents |
|------|----------|
| `.env` | Model, API key, runtime settings |
| `data\app.db` | Projects, sessions, messages, starred literature, HPC connections (SQLite) |
| `data\artifacts\` | Generated figures, tables, and other artifacts |
| `logs\app.log` | Backend logs |
| `workspaces\` | Default project workspaces |

Projects can also bind to any external research folder (data drives, project folders, synced folders).

### 🛠️ Development

Desktop development requires:

- **Python 3.12**
- **Node.js 20.19+** or **22.12+**
- **Rust stable / Cargo**

Launch the desktop dev shell:

```bat
cd /d D:\science_application
start.bat
```

`start.bat` starts the backend and frontend dev server in the background, then opens the Tauri desktop window via `cargo run` (it does **not** open a browser).

For browser-only UI preview testing:

```bat
start_web.bat
```

> The browser URL `http://127.0.0.1:5173` is **only for pre-release UI validation**, not the final user entrypoint.

### 📦 Release

To publish a new version, maintainers push a version tag:

```bat
git tag v0.1.0
git push origin v0.1.0
```

On any `v*` tag, the GitHub Actions workflow (`.github/workflows/build-desktop.yml`) automatically:

1. Provisions Python 3.12, Node.js 22, and Rust on `windows-latest`.
2. Packages the FastAPI backend as `science-backend.exe` with PyInstaller (Tauri sidecar).
3. Builds the frontend.
4. Produces `.exe` (NSIS) and `.msi` installers via `@tauri-apps/cli`.
5. Creates a GitHub Release and uploads the installers as assets.

To build installers locally:

```bat
cd /d D:\science_application
build_windows.bat
```

Output lands in `src-tauri\target\release\bundle\`.

### 📚 Bundled Skills

Open-source installs do not depend on any private local skill folder. Core agent skills ship inside the app at `backend\bundled_skills\`, covering harness behavior, self-awareness, agent isolation, project-directory governance, algorithm/package-first sourcing, protein structure/design/docking/embedding, Nature-style responses, critical review, study-design knowledge organization, conditional notebook/knowledge-graph generation, and Module workflow packaging.

Optional user skills may still be loaded from:

```
%USERPROFILE%\.agents\skills
```

or by setting `SCIENCE_WORKBENCH_USER_SKILLS_DIR`.

### 🔒 Privacy

- All data (projects, sessions, literature, artifacts, API keys) is stored locally only; nothing is uploaded to any Science Workbench server.
- The app accesses the network only to: call your configured LLM API, query public academic databases (PubMed, etc.), and connect to HPC hosts you specify.
- LLM requests go directly from your machine to your chosen model provider. This app does not relay or store your keys.

### 📋 Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Tauri 2 (Rust) |
| Backend | FastAPI + Uvicorn (Python 3.12) |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Zustand |
| Data | SQLite (aiosqlite / SQLAlchemy) |
| Packaging | PyInstaller (backend sidecar) + Tauri bundler (installers) |

### License

MIT License © 2026 Science Workbench Contributors

---

<div align="center">

**⭐ 如果这个项目对你有帮助，欢迎 Star / If this project helps you, please consider starring it.**

</div>
