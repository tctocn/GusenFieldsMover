(function initFieldsMoverLauncher() {
  if (window.__fieldsMoverLauncherMounted) {
    return;
  }
  window.__fieldsMoverLauncherMounted = true;

  const core = window.FieldsMoverCore;

  function requireCore() {
    if (!core) {
      throw new Error('FieldsMoverCore is not available.');
    }
    return core;
  }

  function mountFieldsMoverPanel() {
    let panel = document.querySelector('#fields-mover-panel');
    if (panel) {
      panel.hidden = !panel.hidden;
      return panel;
    }

    const state = {
      currentFields: [],
      selectedIndexes: new Set(),
      copiedFields: null,
      filter: '',
      lastStatus: '准备就绪。',
    };

    panel = document.createElement('aside');
    panel.id = 'fields-mover-panel';
    panel.setAttribute('aria-label', 'Fields Mover');

    const title = document.createElement('div');
    title.className = 'fm-title';
    title.textContent = 'Fields Mover';

    const toolbar = document.createElement('div');
    toolbar.className = 'fm-toolbar';

    const actions = [
      ['read', '读取当前选中组件字段'],
      ['select-visible', '选择可见字段'],
      ['clear-selection', '清空选择'],
      ['copy', '复制选中字段 JSON'],
      ['paste', '粘贴到当前组件字段'],
    ];

    for (const [action, label] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fm-button';
      button.dataset.action = action;
      button.textContent = label;
      toolbar.appendChild(button);
    }

    const filter = document.createElement('input');
    filter.className = 'fm-filter';
    filter.dataset.role = 'filter';
    filter.type = 'search';
    filter.placeholder = '筛选字段';
    filter.autocomplete = 'off';

    const meta = document.createElement('div');
    meta.className = 'fm-meta';
    meta.dataset.role = 'meta';

    const list = document.createElement('div');
    list.className = 'fm-list';
    list.dataset.role = 'list';

    const status = document.createElement('div');
    status.className = 'fm-status';
    status.dataset.role = 'status';
    status.setAttribute('role', 'status');

    panel.append(title, toolbar, filter, meta, list, status);
    document.documentElement.appendChild(panel);

    function setStatus(message) {
      state.lastStatus = message;
      status.textContent = message;
    }

    function getVisibleIndexes() {
      const query = state.filter.trim().toLowerCase();

      return state.currentFields
        .map((field, index) => ({
          field,
          summary: requireCore().createFieldSummary(field, index),
        }))
        .filter(({ summary }) => {
          if (!query) {
            return true;
          }

          return [summary.title, summary.fieldId, summary.subtitle]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
        })
        .map(({ summary }) => summary.index);
    }

    function render() {
      const bufferCount = state.copiedFields ? state.copiedFields.length : 0;
      meta.textContent =
        `已读取 ${state.currentFields.length} | ` +
        `已选择 ${state.selectedIndexes.size} | ` +
        `缓存 ${bufferCount}`;

      list.replaceChildren();

      const visibleIndexes = new Set(getVisibleIndexes());
      state.currentFields.forEach((field, index) => {
        if (!visibleIndexes.has(index)) {
          return;
        }

        const summary = requireCore().createFieldSummary(field, index);
        const row = document.createElement('label');
        row.className = 'fm-field';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.index = String(index);
        checkbox.checked = state.selectedIndexes.has(index);

        const body = document.createElement('span');
        body.className = 'fm-field-body';

        const fieldTitle = document.createElement('span');
        fieldTitle.className = 'fm-field-title';
        fieldTitle.textContent = summary.title;

        const fieldMeta = document.createElement('span');
        fieldMeta.className = 'fm-field-meta';
        fieldMeta.textContent =
          `${summary.fieldId || 'missing fieldId'} | ${summary.subtitle}`;

        body.append(fieldTitle, fieldMeta);
        row.append(checkbox, body);
        list.appendChild(row);
      });

      setStatus(state.lastStatus);
    }

    function readCurrentFields() {
      const context = requireCore().findFieldsContext(document);
      state.currentFields = context.fields;
      state.selectedIndexes.clear();
      setStatus(`已读取 ${state.currentFields.length} 个字段。`);
      render();
    }

    function selectVisibleFields() {
      for (const index of getVisibleIndexes()) {
        state.selectedIndexes.add(index);
      }
      setStatus(`已选择 ${state.selectedIndexes.size} 个字段。`);
      render();
    }

    function clearSelection() {
      state.selectedIndexes.clear();
      setStatus('已清空选择。');
      render();
    }

    async function copySelectedFields() {
      if (state.selectedIndexes.size === 0) {
        throw new Error('请先选择一个或多个字段。');
      }

      const selectedFields = [...state.selectedIndexes]
        .sort((left, right) => left - right)
        .map((index) => state.currentFields[index]);
      state.copiedFields = requireCore().cloneFields(selectedFields);

      const json = JSON.stringify(state.copiedFields, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        setStatus(`已复制 ${state.copiedFields.length} 个字段到缓存和剪贴板。`);
      } catch (error) {
        setStatus(
          `已复制 ${state.copiedFields.length} 个字段到缓存，写入剪贴板失败。`
        );
      }

      render();
    }

    function pasteCopiedFields() {
      if (!state.copiedFields || state.copiedFields.length === 0) {
        throw new Error('没有已复制的字段，请先复制字段。');
      }

      const context = requireCore().findFieldsContext(document);
      const copiedFields = requireCore().cloneFields(state.copiedFields);
      const result = requireCore().planAppendFields(context.fields, copiedFields);

      if (result.toAppend.length > 0) {
        context.fields.push(...result.toAppend);
      }

      state.currentFields = context.fields;
      state.selectedIndexes.clear();
      setStatus(
        `已添加 ${result.toAppend.length} 个，` +
          `跳过重复 ${result.skippedDuplicate.length} 个，` +
          `跳过无效 ${result.skippedInvalid.length} 个。`
      );
      render();
    }

    async function runAction(action) {
      if (action === 'read') {
        readCurrentFields();
        return;
      }
      if (action === 'select-visible') {
        selectVisibleFields();
        return;
      }
      if (action === 'clear-selection') {
        clearSelection();
        return;
      }
      if (action === 'copy') {
        await copySelectedFields();
        return;
      }
      if (action === 'paste') {
        pasteCopiedFields();
      }
    }

    panel.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!(event.target instanceof Element)) {
        return;
      }

      const button = event.target.closest('[data-action]');
      if (!button || !panel.contains(button)) {
        return;
      }

      event.preventDefault();
      runAction(button.dataset.action).catch((error) => {
        setStatus(error && error.message ? error.message : String(error));
        render();
      });
    });

    filter.addEventListener('input', (event) => {
      event.stopPropagation();
      state.filter = filter.value;
      render();
    });

    list.addEventListener('change', (event) => {
      event.stopPropagation();
      if (!(event.target instanceof Element)) {
        return;
      }

      const checkbox = event.target;
      if (!checkbox.matches('input[type="checkbox"][data-index]')) {
        return;
      }

      const index = Number(checkbox.dataset.index);
      if (checkbox.checked) {
        state.selectedIndexes.add(index);
      } else {
        state.selectedIndexes.delete(index);
      }
      render();
    });

    render();
    return panel;
  }

  function injectLauncher(popularFunc) {
    if (!popularFunc || popularFunc.querySelector('[data-fields-mover-launcher="true"]')) {
      return false;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fields-mover-launcher';
    button.dataset.fieldsMoverLauncher = 'true';
    button.textContent = '复制面板';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      mountFieldsMoverPanel();
    });

    popularFunc.appendChild(button);
    return true;
  }

  function installLauncher() {
    const popularFunc = document.querySelector('.popular-func');
    if (injectLauncher(popularFunc)) {
      return true;
    }
    return false;
  }

  if (!installLauncher() && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (installLauncher()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
