# DB Folder（社区维护版）

[![GitHub release](https://img.shields.io/github/v/release/405144788/obsidian-db-folder?style=for-the-badge&sort=semver)](https://github.com/405144788/obsidian-db-folder/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

> 基于 [RafaelGB/obsidian-db-folder](https://github.com/RafaelGB/obsidian-db-folder)（MIT）的社区维护分支。
> 上游已停更 2 年，本分支持续维护并新增功能。

## 简介

Notion 式数据库插件——将 Obsidian 文件夹中的 Markdown 笔记展示为可排序、可筛选、可编辑的表格视图。支持多种数据源（文件夹、标签、链接、Dataview 查询）。

## 新增功能（本分支）

| 版本 | 功能 |
|------|------|
| **3.5.2** | 🖼️ **图片列** — `input: image`，表格中直接显示 60×60 缩略图，自动解析 vault 路径 |
| **3.5.3** | 📁 **指定目录数据源** — 数据库文件可放在任意位置，通过文件夹选择器指定数据源目录 |

## 安装

### BRAT 安装
1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. BRAT 中添加 `405144788/obsidian-db-folder`

### 手动安装
1. 从 [Releases](https://github.com/405144788/obsidian-db-folder/releases) 下载最新版
2. 将 `main.js`、`manifest.json`、`styles.css` 放入 `.obsidian/plugins/dbfolder-community/`

## 使用

右键文件夹 → **新建数据库** → 自动生成表格视图。在设置中可切换数据源类型：

- **当前目录** — 读取数据库文件所在目录
- **指定目录** — 🆕 通过文件夹选择器指定任意目录
- **标签 / 出链 / 反向链接** — 按元数据筛选
- **Dataview 查询** — 自定义查询语句

编辑表格即可直接修改对应笔记的 frontmatter。

## 开发

```bash
git clone https://github.com/405144788/obsidian-db-folder.git
cd obsidian-db-folder
npm install
npm run release
```

欢迎提 Issue / PR。

---

# DB Folder (Community Fork)

> Community-maintained fork of [RafaelGB/obsidian-db-folder](https://github.com/RafaelGB/obsidian-db-folder) (MIT).
> Upstream has been unmaintained for 2+ years. We keep it alive and add new features.

## Overview

A Notion-like database plugin for Obsidian. Display markdown notes as sortable, filterable, editable table views. Supports multiple data sources: folders, tags, links, and Dataview queries.

## New Features (This Fork)

| Version | Feature |
|---------|---------|
| **3.5.2** | 🖼️ **Image column** — `input: image` type, displays 60×60 thumbnails with vault path resolution |
| **3.5.3** | 📁 **Specified folder source** — Place database file anywhere, pick data source folder via UI |

## Installation

### Via BRAT
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add `405144788/obsidian-db-folder` in BRAT

### Manual
1. Download from [Releases](https://github.com/405144788/obsidian-db-folder/releases)
2. Extract `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/dbfolder-community/`

## Usage

Right-click a folder → **New database** → a table view is generated automatically. Switch data sources in settings:

- **Current folder** — Read from the folder containing the database file
- **Specified folder** — 🆕 Choose any folder via folder picker
- **Tag / Links** — Filter by metadata
- **Dataview query** — Custom queries

Editing the table directly modifies the corresponding note's frontmatter.

## Development

```bash
git clone https://github.com/405144788/obsidian-db-folder.git
cd obsidian-db-folder
npm install
npm run release
```

PRs and issues welcome.

## Credits

- Original: [RafaelGB/obsidian-db-folder](https://github.com/RafaelGB/obsidian-db-folder) (MIT License)
- Table engine: [TanStack/react-table](https://github.com/TanStack/react-table)
- Query engine: [obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview)
