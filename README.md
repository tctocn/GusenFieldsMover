# Fields Mover

Fields Mover 是一个本地开发用 Chrome 插件，把当前选中组件的字段配置复制到另一个当前选中组件中。

插件采用 Manifest V3 content script 形式运行，会在目标页面注入一个轻量右侧面板。你可以从当前选中的组件读取字段，勾选需要复制的字段，再把它们追加到另一个当前选中的组件中。

## 功能

- 在页面 `.popular-func` 区域注入 `复制面板` 按钮。
- 从当前选中组件读取字段。
- 支持 `.input-box` 组件的 `.__vue__.fields`。
- 支持 `.coust-table` 组件的 `.__vue__.columns`。
- 在右侧面板展示字段摘要。
- 支持字段筛选、选择、复制和粘贴。
- 粘贴时使用 `fieldId` 跳过重复字段。
- 即使剪贴板写入失败，也会保留插件内部复制缓存。
- 包含核心复制和粘贴规则的 Node 测试。

## 安装

1. 打开 Chrome，进入 `chrome://extensions`。
2. 开启开发者模式。
3. 点击 `加载已解压的扩展程序`。
4. 选择本项目目录。
5. 打开支持的目标页面。

## 使用方式

1. 点击页面工具栏中的 `复制面板`。
2. 在页面中选中来源组件。
3. 点击 `读取当前选中组件字段`。
4. 在面板中勾选一个或多个字段。
5. 点击 `复制选中字段 JSON`。
6. 在页面中选中目标组件。
7. 点击 `粘贴到当前组件字段`。

## 支持页面

插件当前配置的匹配页面为：

```text
http://example.internal/*
```

## 项目结构

```text
manifest.json              Chrome 插件清单
src/fields-core.js         组件定位、字段复制和粘贴核心逻辑
src/content.js             页面注入、面板 UI 和用户操作处理
src/panel.css              面板样式
src/*.test.js              Node 测试
fixtures/                  测试 fixture
docs/                      设计说明和 V1 详细文档
```

## 开发

运行测试：

```bash
npm test
```

检查 JavaScript 语法：

```bash
node --check src/fields-core.js
node --check src/content.js
```

项目当前没有构建步骤，直接把项目目录作为未打包 Chrome 插件加载即可。实际使用前，请把 `manifest.json` 中的 `matches` 改成目标页面地址。

## 说明

- content script 使用 `"world": "MAIN"`，用于访问页面 Vue 实例，例如 `element.__vue__`。
- 剪贴板 JSON 主要用于查看或外部复制。插件内部复制缓存可以保留 JSON 无法完整表达的对象成员。
- 粘贴只会追加带有 truthy `fieldId` 的有效字段，并跳过目标组件中已经存在的相同 `fieldId`。
