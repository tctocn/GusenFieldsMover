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
      currentContext: null,
      selectedIndexes: new Set(),
      copiedFields: null,
      clipboardMode: false,
      filter: '',
      lastStatus: '准备就绪。',
    };

    panel = document.createElement('aside');
    panel.id = 'fields-mover-panel';
    panel.setAttribute('aria-label', 'Fields Mover');

    const header = document.createElement('div');
    header.className = 'fm-header';

    const title = document.createElement('div');
    title.className = 'fm-title';
    title.textContent = 'Fields Mover';
    title.setAttribute('title', '拖动移动面板');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'fm-close';
    closeButton.dataset.action = 'close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', '关闭面板');
    closeButton.setAttribute('title', '关闭');

    header.append(title, closeButton);

    const toolbar = document.createElement('div');
    toolbar.className = 'fm-toolbar';

    const actions = [
      ['read', '读取当前选中组件字段'],
      ['copy', '复制'],
      ['paste', '粘贴'],
      ['copy-clipboard', '复制到剪贴板'],
      ['paste-clipboard', '粘贴剪贴板'],
      ['select-visible', '全选'],
      ['clear-selection', '清空'],
    ];

    const copyGroup = document.createElement('div');
    copyGroup.className = 'fm-copy-group';
    copyGroup.setAttribute('role', 'group');
    copyGroup.setAttribute('aria-label', '复制与粘贴');
    const modeLabel = document.createElement('label');
    modeLabel.className = 'fm-mode';
    const modeToggle = document.createElement('input');
    modeToggle.type = 'checkbox';
    modeToggle.dataset.role = 'clipboard-mode';
    const modeText = document.createElement('span');
    modeText.textContent = '剪贴板';
    modeLabel.append(modeToggle, modeText);
    copyGroup.appendChild(modeLabel);

    for (const [action, label] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fm-button';
      button.dataset.action = action;
      button.textContent = label;
      if (['copy', 'paste', 'copy-clipboard', 'paste-clipboard'].includes(action)) {
        copyGroup.appendChild(button);
      } else {
        toolbar.appendChild(button);
        if (action === 'read') toolbar.appendChild(copyGroup);
      }
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

    const jsonEditor = document.createElement('div');
    jsonEditor.className = 'fm-json-editor';
    jsonEditor.dataset.role = 'json-editor';
    jsonEditor.hidden = true;
    const jsonLabel = document.createElement('label');
    jsonLabel.textContent = '字段 JSON 数组';
    jsonLabel.setAttribute('for', 'fm-json-input');
    const jsonInput = document.createElement('textarea');
    jsonInput.id = 'fm-json-input';
    jsonInput.dataset.role = 'json-input';
    jsonInput.placeholder = '在此粘贴字段 JSON 数组';
    jsonInput.setAttribute('aria-describedby', 'fm-json-error');
    const jsonError = document.createElement('div');
    jsonError.id = 'fm-json-error';
    jsonError.dataset.role = 'json-error';
    jsonError.setAttribute('role', 'alert');
    const jsonActions = document.createElement('div');
    jsonActions.className = 'fm-json-actions';
    for (const [action, label] of [['confirm-json', '确认粘贴'], ['cancel-json', '取消']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fm-button';
      button.dataset.action = action;
      button.textContent = label;
      jsonActions.appendChild(button);
    }
    jsonEditor.append(jsonLabel, jsonInput, jsonError, jsonActions);

    panel.append(header, toolbar, jsonEditor, filter, meta, list, status);
    document.documentElement.appendChild(panel);

    function closeJsonEditor() {
      jsonEditor.hidden = true;
      jsonInput.value = '';
      jsonError.textContent = '';
    }

    modeToggle.addEventListener('change', (event) => {
      event.stopPropagation();
      state.clipboardMode = modeToggle.checked;
      if (!state.clipboardMode) closeJsonEditor();
      render();
    });

    function hidePanel() {
      panel.hidden = true;
    }

    function keepPanelInViewport(left, top) {
      const rect =
        typeof panel.getBoundingClientRect === 'function'
          ? panel.getBoundingClientRect()
          : { width: panel.offsetWidth || 340, height: panel.offsetHeight || 0 };
      const viewportWidth =
        window.innerWidth || document.documentElement.clientWidth || rect.width;
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || rect.height;
      const maxLeft = Math.max(0, viewportWidth - rect.width);
      const maxTop = Math.max(0, viewportHeight - rect.height);

      return {
        left: Math.min(Math.max(0, left), maxLeft),
        top: Math.min(Math.max(0, top), maxTop),
      };
    }

    title.addEventListener('mousedown', (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect =
        typeof panel.getBoundingClientRect === 'function'
          ? panel.getBoundingClientRect()
          : { left: 0, top: 0, width: panel.offsetWidth || 340, height: panel.offsetHeight || 0 };
      const startX = event.clientX || 0;
      const startY = event.clientY || 0;
      const startLeft = rect.left || 0;
      const startTop = rect.top || 0;

      function movePanel(moveEvent) {
        moveEvent.preventDefault();
        const nextPosition = keepPanelInViewport(
          startLeft + (moveEvent.clientX || 0) - startX,
          startTop + (moveEvent.clientY || 0) - startY
        );

        panel.style.left = `${nextPosition.left}px`;
        panel.style.top = `${nextPosition.top}px`;
        panel.style.right = 'auto';
      }

      function stopDragging() {
        document.removeEventListener('mousemove', movePanel);
        document.removeEventListener('mouseup', stopDragging);
      }

      document.addEventListener('mousemove', movePanel);
      document.addEventListener('mouseup', stopDragging);
    });

    document.addEventListener('click', (event) => {
      if (
        !panel.hidden &&
        event.target instanceof Element &&
        !panel.contains(event.target)
      ) {
        hidePanel();
      }
    });

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
      for (const action of ['copy', 'paste', 'copy-clipboard', 'paste-clipboard']) {
        const isClipboard = action.endsWith('-clipboard');
        copyGroup.querySelector(`[data-action="${action}"]`).hidden = isClipboard !== state.clipboardMode;
      }
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
      state.currentContext = context;
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

    async function writeClipboardText(text) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(text);
          return;
        } catch (error) {
          console.warn('[Fields Mover] Clipboard API 写入失败，尝试兼容复制。', error);
        }
      }

      const activeElement = document.activeElement;
      const inputSelection = activeElement && typeof activeElement.selectionStart === 'number'
        ? [activeElement.selectionStart, activeElement.selectionEnd, activeElement.selectionDirection]
        : null;
      const selection = window.getSelection();
      const ranges = [];
      if (selection) {
        for (let index = 0; index < selection.rangeCount; index += 1) {
          ranges.push(selection.getRangeAt(index).cloneRange());
        }
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.readOnly = true;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.documentElement.appendChild(textarea);
      try {
        textarea.focus({ preventScroll: true });
        textarea.select();
        if (!document.execCommand('copy')) {
          throw new Error('document.execCommand(copy) 返回失败。');
        }
      } finally {
        textarea.remove();
        if (activeElement && typeof activeElement.focus === 'function') {
          activeElement.focus({ preventScroll: true });
          if (inputSelection) {
            activeElement.setSelectionRange(...inputSelection);
          }
        }
        if (selection) {
          selection.removeAllRanges();
          for (const range of ranges) selection.addRange(range);
        }
      }
    }

    function prepareSelectedFields() {
      if (state.selectedIndexes.size === 0) {
        throw new Error('请先选择一个或多个字段。');
      }

      const selectedFields = [...state.selectedIndexes]
        .sort((left, right) => left - right)
        .map((index) => state.currentFields[index]);
      const context = state.currentContext || requireCore().findFieldsContext(document);
      return requireCore().prepareFieldsForCopy(
        selectedFields,
        context.vue
      );

    }

    function copySelectedFields() {
      state.copiedFields = prepareSelectedFields();
      setStatus(`已复制 ${state.copiedFields.length} 个字段到当前页面缓存。`);
      render();
    }

    async function copyToClipboard() {
      const fields = prepareSelectedFields();
      const json = JSON.stringify(fields, null, 2);
      try {
        await writeClipboardText(json);
        setStatus(`已复制 ${fields.length} 个字段到剪贴板。`);
      } catch (error) {
        console.warn('[Fields Mover] 写入剪贴板失败。', error);
        setStatus('写入剪贴板失败，请重试。');
      }
      render();
    }

    function confirmJsonPaste() {
      try {
        if (!jsonInput.value.trim()) throw new Error('请输入字段 JSON 数组。');
        let fields;
        try {
          fields = JSON.parse(jsonInput.value);
        } catch (error) {
          throw new Error('JSON 格式错误，请检查输入。');
        }
        if (!Array.isArray(fields) || fields.some((field) => !field || typeof field !== 'object' || Array.isArray(field))) {
          throw new Error('请输入由字段对象组成的 JSON 数组。');
        }
        const context = requireCore().findFieldsContext(document);
        const plan = requireCore().planAppendFields(context.fields, fields);
        const prepared = requireCore().prepareFieldsForCopy(plan.toAppend, context.vue);
        appendFields(context, { ...plan, toAppend: prepared });
        closeJsonEditor();
      } catch (error) {
        jsonError.textContent = error && error.message ? error.message : String(error);
      }
    }

    function pasteCopiedFields() {
      if (!state.copiedFields || state.copiedFields.length === 0) {
        throw new Error('没有已复制的字段，请先复制字段。');
      }

      const context = requireCore().findFieldsContext(document);
      const copiedFields = requireCore().cloneFields(state.copiedFields);
      const result = requireCore().planAppendFields(context.fields, copiedFields);

      appendFields(context, result);
    }

    function appendFields(context, result) {
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
      if (action === 'close') {
        hidePanel();
        return;
      }
      if (action === 'copy-clipboard' && state.clipboardMode) {
        await copyToClipboard();
        return;
      }
      if (action === 'paste-clipboard' && state.clipboardMode) {
        jsonEditor.hidden = false;
        jsonInput.focus();
        return;
      }
      if (action === 'confirm-json' && state.clipboardMode && !jsonEditor.hidden) {
        confirmJsonPaste();
        return;
      }
      if (action === 'cancel-json') {
        closeJsonEditor();
        return;
      }
      if (action === 'copy' && !state.clipboardMode) {
        copySelectedFields();
        return;
      }
      if (action === 'paste' && !state.clipboardMode) {
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

      if (button.hidden) return;
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

    const launcher = document.createElement('a');
    launcher.setAttribute('data-v-5d28af34', '');
    launcher.className = 'link el-link el-link--primary is-underline';
    launcher.dataset.fieldsMoverLauncher = 'true';

    const icon = document.createElement('i');
    icon.className = 'iconfont icon-fuzhi1';

    const label = document.createElement('span');
    label.className = 'el-link--inner';
    label.textContent = '复制面板';

    const placeholder = document.createComment('');

    launcher.append(icon, label, placeholder);
    launcher.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      mountFieldsMoverPanel();
    });

    popularFunc.appendChild(launcher);
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
