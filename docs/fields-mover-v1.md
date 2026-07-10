# Fields Mover V1 最终说明

## 目标

Fields Mover 是一个本地开发用 Chrome 插件，用于在目标 Vue 页面中，把当前选中组件的字段配置复制到另一个当前选中组件中。

插件不依赖 DevTools `$0`，也不通过控制台手动访问 `$0.__vue__`。它直接注入到页面主环境中，通过页面 DOM 上的选中状态和 Vue 实例读取、追加字段配置。

## 使用方式

1. 在 Chrome 的扩展程序页面以“加载已解压的扩展程序”方式加载本项目目录。
2. 打开目标页面。
3. 页面 `.popular-func` 区域会出现 `复制面板` 按钮。
4. 点击 `复制面板` 打开右侧工具面板。
5. 在页面中选中来源组件。
6. 点击 `读取当前选中组件字段`。
7. 勾选一个或多个字段。
8. 点击 `复制选中字段 JSON`。
9. 在页面中选中目标组件。
10. 点击 `粘贴到当前组件字段`。

来源组件与目标组件不会同时选中，所以面板共用同一个字段展示区域。

## 组件定位规则

当前选中组件由页面样式标记：

```js
document.querySelector('.base-control-box.row-box.selected')
```

这个节点只是选中外壳，真实字段数据在它的子组件上。

V1 明确只支持两类宿主组件：

| 宿主节点 | 读取和写入的 Vue 属性 |
| --- | --- |
| `.input-box` | `.__vue__.fields` |
| `.coust-table` | `.__vue__.columns` |

规则是严格绑定的：

- `.input-box` 下面只取 `fields`，即使同一个 Vue 实例上存在 `columns` 也不取。
- `.coust-table` 下面只取 `columns`，即使同一个 Vue 实例上存在 `fields` 也不取。
- 不会扫描未知 class 的子节点来猜测 `fields` 或 `columns`，避免误命中。

## 复制和粘贴规则

复制时：

- 只复制面板中勾选的字段对象。
- 插件内部缓存使用保留对象成员的深拷贝，不再使用 `JSON.stringify/parse` 作为内部复制方式。
- 会尝试把可查看的 JSON 写入剪贴板。
- 剪贴板 JSON 仅用于查看或外部复制，不能完整表达函数、`undefined` 等非 JSON 成员。
- 即使写入剪贴板失败，插件内部缓存仍然可用于粘贴。

粘贴时：

- 粘贴目标永远是点击粘贴按钮时页面当前选中的组件。
- `.input-box` 目标会 append 到 `fields`。
- `.coust-table` 目标会 append 到 `columns`。
- 使用 `fieldId` 判断重复。
- 目标中已有相同 `fieldId` 的字段会跳过。
- 没有 truthy `fieldId` 的字段会跳过。
- 对同一次复制批次内重复出现的 `fieldId`，只追加第一个。

## 插件界面

插件在页面右侧提供一个轻量面板，主要按钮为：

- `读取当前选中组件字段`
- `选择可见字段`
- `清空选择`
- `复制选中字段 JSON`
- `粘贴到当前组件字段`

面板还提供字段筛选框、字段勾选列表、已读取数量、已选择数量、缓存数量和操作状态提示。

## 技术结构

项目是无构建步骤的 Manifest V3 Chrome 插件。

主要文件：

- `manifest.json`：插件元信息和 content script 注册。
- `src/fields-core.js`：组件定位、字段摘要、字段复制、追加计划等核心逻辑。
- `src/content.js`：注入 `复制面板` 按钮、创建右侧面板、处理用户操作。
- `src/panel.css`：右侧面板样式。
- `src/fields-core.test.js`：核心规则测试。
- `src/content.test.js`：页面注入和面板基础行为测试。

content script 使用：

```json
"world": "MAIN"
```

这样可以访问页面 DOM 节点上的 Vue expando，例如 `element.__vue__`。

## 已完成范围

V1 已完成：

- 在 `.popular-func` 中注入 `复制面板` 按钮。
- 手动打开和隐藏右侧面板。
- 从当前选中组件读取字段。
- 支持 `.input-box.__vue__.fields`。
- 支持 `.coust-table.__vue__.columns`。
- 展示字段列表。
- 支持多选字段。
- 支持筛选可见字段。
- 支持复制选中字段到插件内部缓存。
- 尝试复制 JSON 到剪贴板。
- 支持粘贴追加到当前选中目标组件。
- 按 `fieldId` 跳过重复字段。
- 跳过无效字段。
- 中文按钮和状态提示。
- 测试覆盖核心定位和复制粘贴规则。

V1 不包含：

- 撤销上一次粘贴。
- 跨刷新或跨页面持久化缓存。
- DevTools 面板。
- Chrome Web Store 发布配置。
- 自动识别未知组件类型。
- 页面专属刷新钩子。

## 验证结果

当前验证命令：

```bash
npm test
node --check src/fields-core.js
node --check src/content.js
```

当前结果：

- `npm test`：14/14 通过。
- `node --check src/fields-core.js`：通过。
- `node --check src/content.js`：通过。

## 后续可迭代方向

可选的 V2 能力：

- 增加更多明确组件规则，例如某个 class 对应某个 Vue 属性。
- 粘贴后调用页面已有刷新方法，让 UI 立即重绘。
- 提供导入 JSON 功能，用于跨页面或跨会话粘贴。
- 增加粘贴前预览差异。
- 增加仅复制部分属性或字段模板化能力。
- 增加一次性撤销，但需要确认目标页面状态变更方式。
