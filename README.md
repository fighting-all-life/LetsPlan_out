# 🧠 Let'sPlan — 桌面每日计划 + 桌宠陪伴

<p align="center">
  <img src="https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-42-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-UNLICENSED-lightgrey?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/version-0.1.1-blue?style=flat-square" alt="Version" />
</p>

<p align="center">
  <b>🐱 每日任务管理 + 桌面宠物陪伴 + 赛博朋克 UI</b>
</p>

---

## 📖 项目简介

**Let'sPlan** 是一个本地优先（local-first）的 Windows 桌面每日计划应用，内置一只可与用户互动的桌面宠物。

每天开机，一只会生气、会逃跑、会庆祝的桌面宠物在等你。它不只是装饰——你做任务的效率、点击它的次数、甚至你多久不理它，都会影响它的情绪和行为。任务完成率高，它会开心庆祝；连续戳它多次，它会躲到屏幕边缘。

> 🗂️ 每日计划 + 🐾 桌宠系统 + 🎨 赛博朋克 UI

---

## ✨ 核心特性

### 🐾 桌面宠物系统

- **多宠物切换**：猫咪 🐱 / 小狗 🐶 / 机器人 🤖，一键切换
- **情绪引擎**：快乐 / 愤怒 / 恐惧 / 好奇 四维情绪，受任务完成度和用户交互影响
- **行为决策**：连续点击超阈值 → 躲避逃跑；频繁戳击 → 瞬闪模式
- **右键菜单**：打开主窗口 / 打开控制中心 / 切换宠物
- **拖动支持**：桌面任意拖动，边缘自动裁剪
- **提示气泡**：阶段性提示任务进度、情绪状态

### 📅 任务管理系统

- 按日期创建/查看计划，支持拖拽排序
- 紧急程度 (常规/紧急) + 工作/学习分类
- 主界面 + 系统托盘同步显示今日完成百分比
- 全部完成时触发庆祝动画 🎉

### 📊 历史与分析

- 历史概览 + 完成筛选 + 日历热力图
- 按日详情、独立历史窗口
- Excel 导出 (today/week/month/all)
- 周报/月报 Markdown + PDF 导出

### 💻 桌面集成

- 系统托盘驻留，关闭隐藏到托盘
- 开机自启设置
- Windows NSIS 安装包
- 本地 SQLite 存储，卸载默认保留数据
- `electron-updater` 自动更新支持

### 🎨 赛博朋克 UI

- 深黑底色 + 霓虹青/紫发光
- 玻璃拟态面板、全息浮动 UI
- 金属细边框 + 光晕动效
- 12 色主题调色盘

---

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 🖥️ 桌面框架 | **Electron 42** | 托盘、开机自启、自动更新 |
| ⚛️ UI | **React 19** + **TypeScript 5.8** | 组件化、类型安全 |
| ⚡ 构建 | **Vite 7** | 极速 HMR 开发体验 |
| 🗄️ 数据库 | **node:sqlite** | Electron/Node 内置，零依赖 |
| 📦 打包 | **electron-builder** | NSIS 安装包 + unpacked |
| 🧪 测试 | **Vitest** | 单元测试 + 集成 smoke |
| 🎨 图标 | **lucide-react** | 轻量 SVG 图标库 |

---

## 📦 构建安装包

### 免安装版（绿色版）

```powershell
npm run package:win
```

产物输出到 `release-win/win-unpacked/`，直接双击 `LetsPlan.exe` 运行。

### NSIS 安装包

```powershell
npm run dist:win
```

产物 `release-win/LetsPlan-0.1.1-win-x64.exe`，支持桌面快捷方式、开始菜单、自定义安装路径。

### 系统要求

- Windows 10 / 11 x64
- 无需额外运行时（Electron 自带 Chromium）

---

## 📦 下载安装

### GitHub Releases

前往 [Releases](https://github.com/fighting-all-life/LetsPlan_out/releases) 页面下载最新版本：

| 下载方式 | 文件 | 说明 |
|----------|------|------|
| 📦 **一键安装包 (.exe)** | `LetsPlan-0.1.1-win-x64.exe` | NSIS 安装包，支持桌面快捷方式、开始菜单、自定义安装路径 |
| 💼 **MSI 安装包 (.msi)** | `LetsPlan-0.1.1-win-x64.msi` | Windows Installer 标准格式 |
| 🟢 **免安装版** | `win-unpacked/LetsPlan.exe` | 绿色免安装，解压即用，不写注册表 |

> ⚠️ 当前安装包未做正式代码签名，Windows 可能显示"未知发布者"提示，点击"仍要运行"即可。

### 系统要求

- Windows 10 / 11 x64
- 无需额外运行时（Electron 自带 Chromium）

---

## 📁 项目结构

```text
Let-sPlan/
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 窗口管理、生命周期、IPC
│   │   ├── tray.ts            # 系统托盘（进度百分比 + 右键菜单）
│   │   ├── autoLaunch.ts      # 开机自启
│   │   ├── autoUpdate.ts      # electron-updater 自动更新
│   │   ├── preload.ts         # contextBridge 预加载脚本
│   │   ├── petWindowBounds.ts # 桌宠多屏边界裁剪
│   │   ├── petContextMenu.ts  # 桌宠右键菜单
│   │   ├── planIpc.ts         # 计划 CRUD IPC 处理
│   │   ├── settingsIpc.ts     # 设置持久化 IPC
│   │   ├── appSettings.ts     # 应用设置存储
│   │   ├── appMenu.ts         # 应用菜单栏
│   │   ├── rendererState.ts   # 渲染进程状态广播
│   │   └── releaseChannel.ts  # 发布频道配置
│   │
│   └── modules/
│       ├── api/               # 业务 API
│       │   ├── index.ts       # IPC 接口层、计划视图组装
│       │   ├── report.ts      # 周报/月报 Markdown/HTML 导出
│       │   ├── intervention.ts # 行为干预引擎（L1-L4 + 夜间总结）
│       │   └── types.ts       # API 类型定义
│       │
│       ├── database/          # SQLite 数据层
│       │   ├── index.ts       # 数据库初始化、CRUD
│       │   └── types.ts       # 数据模型定义
│       │
│       └── ui/                # React UI 渲染进程
│           ├── App.tsx        # 主界面组件（计划面板 + 控制中心 + 历史窗口）
│           ├── planState.ts   # 计划状态管理（纯函数）
│           ├── petState.ts    # 桌宠状态机
│           ├── petVisuals.tsx # 桌宠 SVG 渲染（猫/狗/机器人）
│           ├── petDrag.ts     # 桌宠拖动交互逻辑
│           ├── petHitTest.ts  # 桌宠碰撞检测
│           ├── styles.css     # 赛博朋克全局样式
│           └── index.html     # HTML 入口
│
├── scripts/                   # 构建/打包/验证脚本
│   ├── runElectron.mjs        # 开发模式启动
│   ├── prepareReleaseConfig.mjs # 发布配置
│   ├── packageReleaseZip.mjs  # 发布用 zip 打包
│   ├── cleanRelease.mjs       # 清理旧产物
│   ├── generateWindowsIcon.cjs # icon.svg → icon.ico
│   ├── smokePackaged.mjs      # 免安装版 smoke
│   ├── smokeInstaller.mjs     # 安装器 smoke
│   ├── smokePetDrag.mjs       # 桌宠拖动 E2E
│   ├── stageReleaseChannel.mjs # 发布频道组织
│   ├── verifyReleaseChannel.mjs # 发布频道验证
│   └── verifyWindowsSignature.mjs # Windows 签名验证
│
├── tests/
│   ├── unit/                  # 单元测试 (Vitest)
│   │   ├── api/               # API 层测试
│   │   ├── database/          # 数据库层测试
│   │   ├── main/              # 主进程测试
│   │   └── ui/                # UI 逻辑测试
│   └── integration/           # Electron 集成测试
│
├── build/                     # 构建资源 (icon.svg → icon.ico)
└── package.json
```

---

## 🤝 贡献

欢迎提 Issue 和 PR！

- 🐛 报告 Bug / 💡 功能建议 → [GitHub Issues](https://github.com/fighting-all-life/LetsPlan_out/issues)

---

## 📄 许可证

本项目目前为 **UNLICENSED**（保留所有权利）。

---

## 🙏 致谢

- ⚡ [Electron](https://www.electronjs.org/) — 桌面应用框架
- ⚛️ [React](https://react.dev/) — UI 框架
- 🎨 [lucide-react](https://lucide.dev/) — 图标库

---

<p align="center">
  <b>🐾 让每一天的计划，都有一只小宠物陪着你完成 🐾</b>
</p>
