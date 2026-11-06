const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.dataset = {};
    this.eventListeners = {};
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.placeholder = '';
    this.autocomplete = '';
    this.checked = false;
    this.hidden = false;
    this.style = {};
    this.value = '';
  }

  focus() {
    this.focused = true;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  appendChild(node) {
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, listener) {
    this.eventListeners[type] ||= [];
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    this.eventListeners[type] = (this.eventListeners[type] || []).filter(
      (currentListener) => currentListener !== listener
    );
  }

  dispatchEvent(event) {
    event.target ||= this;
    event.preventDefault ||= () => {};
    event.stopPropagation ||= () => {};
    for (const listener of this.eventListeners[event.type] || []) {
      listener(event);
    }
  }

  contains(node) {
    for (let current = node; current; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }

  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches(selector)) return current;
    }
    return null;
  }

  matches(selector) {
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }

    const dataMatch = selector.match(/^\[data-([a-z-]+)(?:="([^"]+)")?\]$/);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      return dataMatch[2] === undefined
        ? this.dataset[key] !== undefined
        : this.dataset[key] === dataMatch[2];
    }

    if (selector.startsWith('.')) {
      const classes = selector.split('.').filter(Boolean);
      const ownClasses = new Set(this.className.split(/\s+/).filter(Boolean));
      return classes.every((className) => ownClasses.has(className));
    }

    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];

    function visit(node) {
      for (const child of node.children) {
        if (child.matches(selector)) {
          matches.push(child);
        }
        visit(child);
      }
    }

    visit(this);
    return matches;
  }
}

class FakeComment extends FakeElement {
  constructor(textContent) {
    super('#comment');
    this.textContent = textContent;
  }

  matches() {
    return false;
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('#document');
    this.documentElement = new FakeElement('html');
    this.appendChild(this.documentElement);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createComment(textContent) {
    return new FakeComment(textContent);
  }
}

function runContentScript(document, configure = () => {}) {
  const source = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  const context = {
    document,
    Element: FakeElement,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    },
    window: {
      innerWidth: 1024,
      innerHeight: 768,
      FieldsMoverCore: {
        createFieldSummary: (field, index) => ({
          index,
          fieldId: field.fieldId,
          title: field.label,
          subtitle: `key: ${field.key}`
        }),
        cloneFields: (fields) => JSON.parse(JSON.stringify(fields)),
        findFieldsContext: () => ({ fields: [] }),
        planAppendFields: () => ({
          toAppend: [],
          skippedDuplicate: [],
          skippedInvalid: []
        })
      }
    }
  };
  context.window.window = context.window;
  context.window.document = document;
  context.window.navigator = context.navigator;
  context.window.Element = FakeElement;

  configure(context);
  vm.runInNewContext(source, context);
}

test('content script injects launcher into popular-func before mounting panel', () => {
  const document = new FakeDocument();
  const popularFunc = document.createElement('div');
  popularFunc.className = 'popular-func';
  document.documentElement.appendChild(popularFunc);

  runContentScript(document);

  const launcher = document.querySelector('[data-fields-mover-launcher="true"]');
  assert.ok(launcher);
  assert.equal(launcher.tagName, 'A');
  assert.equal(launcher.className, 'link el-link el-link--primary is-underline');
  assert.equal(launcher.attributes['data-v-5d28af34'], '');
  assert.equal(launcher.querySelector('i').className, 'iconfont icon-fuzhi1');
  assert.equal(launcher.querySelector('.el-link--inner').textContent, '复制面板');
  assert.equal(document.querySelector('#fields-mover-panel'), null);

  launcher.dispatchEvent({ type: 'click' });

  const panel = document.querySelector('#fields-mover-panel');
  assert.ok(panel);
  assert.equal(panel.querySelector('.fm-close').textContent, '×');
  assert.equal(panel.querySelector('.fm-close').attributes['aria-label'], '关闭面板');
  assert.deepEqual(
    panel.querySelector('.fm-toolbar').querySelectorAll('button').map((button) => button.textContent),
    ['读取当前选中组件字段', '复制', '粘贴', '复制到剪贴板', '粘贴剪贴板', '全选', '清空']
  );
});

test('panel hides when clicking outside of it', () => {
  const document = new FakeDocument();
  const popularFunc = document.createElement('div');
  popularFunc.className = 'popular-func';
  document.documentElement.appendChild(popularFunc);

  runContentScript(document);
  document.querySelector('[data-fields-mover-launcher="true"]').dispatchEvent({
    type: 'click',
  });

  const panel = document.querySelector('#fields-mover-panel');
  assert.equal(panel.hidden, false);

  document.dispatchEvent({ type: 'click', target: popularFunc });

  assert.equal(panel.hidden, true);
});

test('panel hides when clicking the close button', () => {
  const document = new FakeDocument();
  const popularFunc = document.createElement('div');
  popularFunc.className = 'popular-func';
  document.documentElement.appendChild(popularFunc);

  runContentScript(document);
  document.querySelector('[data-fields-mover-launcher="true"]').dispatchEvent({
    type: 'click',
  });

  const panel = document.querySelector('#fields-mover-panel');
  assert.equal(panel.hidden, false);

  panel.dispatchEvent({ type: 'click', target: panel.querySelector('.fm-close') });

  assert.equal(panel.hidden, true);
});

test('panel can be dragged by its title', () => {
  const document = new FakeDocument();
  const popularFunc = document.createElement('div');
  popularFunc.className = 'popular-func';
  document.documentElement.appendChild(popularFunc);

  runContentScript(document);
  document.querySelector('[data-fields-mover-launcher="true"]').dispatchEvent({
    type: 'click',
  });

  const panel = document.querySelector('#fields-mover-panel');
  panel.getBoundingClientRect = () => ({
    left: 16,
    top: 64,
    width: 340,
    height: 300,
  });

  const title = panel.querySelector('.fm-title');
  title.dispatchEvent({
    type: 'mousedown',
    button: 0,
    clientX: 20,
    clientY: 70,
  });
  document.dispatchEvent({
    type: 'mousemove',
    clientX: 120,
    clientY: 170,
  });
  document.dispatchEvent({ type: 'mouseup' });

  assert.equal(panel.style.left, '116px');
  assert.equal(panel.style.top, '164px');
  assert.equal(panel.style.right, 'auto');
});


for (const mode of ['modern', 'missing', 'rejected', 'false', 'throws']) {
  test(`clipboard copy handles ${mode} and preserves cached fields`, async () => {
    const document = new FakeDocument();
    const toolbar = document.createElement('div');
    toolbar.className = 'popular-func';
    document.documentElement.appendChild(toolbar);
    const fields = [{ fieldId: 'name', label: '名称' }];
    const destination = [];
    let currentFields = fields;
    let clipboardText;
    const warnings = [];
    const originalFocus = document.createElement('input');
    originalFocus.selectionStart = 1;
    originalFocus.selectionEnd = 3;
    originalFocus.selectionDirection = 'backward';
    originalFocus.focus = () => { document.activeElement = originalFocus; };
    originalFocus.setSelectionRange = (...args) => {
      assert.deepEqual(args, [1, 3, 'backward']);
    };
    document.activeElement = originalFocus;
    const range = { cloneRange() { return this; } };
    const ranges = [range];
    const selection = {
      get rangeCount() { return ranges.length; },
      getRangeAt: (index) => ranges[index],
      removeAllRanges: () => { ranges.length = 0; },
      addRange: (value) => ranges.push(value),
    };
    const createElement = document.createElement.bind(document);
    document.createElement = (tag) => {
      const element = createElement(tag);
      element.focus = () => { document.activeElement = element; };
      element.select = () => { selection.removeAllRanges(); };
      element.remove = () => {
        const siblings = element.parentElement.children;
        siblings.splice(siblings.indexOf(element), 1);
      };
      return element;
    };
    document.execCommand = (command) => {
      assert.equal(command, 'copy');
      assert.notEqual(mode, 'modern', 'modern success must not use fallback');
      const textarea = document.documentElement.children.find((element) => element.tagName === 'TEXTAREA');
      assert.ok(textarea);
      assert.equal(textarea.readOnly, true);
      if (mode === 'throws') throw new Error('copy blocked');
      if (mode === 'false') return false;
      clipboardText = textarea.value;
      return true;
    };
    runContentScript(document, (context) => {
      context.console = { log() {}, warn: (...args) => warnings.push(args) };
      context.window.getSelection = () => selection;
      context.window.FieldsMoverCore = {
        ...require('./fields-core.js'),
        findFieldsContext: () => ({ fields: currentFields, vue: { $gUtil: { GUID: () => 'copied-id' } } }),
      };
      context.navigator.clipboard = mode === 'missing' ? undefined : {
        writeText: async (text) => {
          if (mode !== 'modern') throw new Error('permission denied');
          clipboardText = text;
        },
      };
    });
    document.querySelector('[data-fields-mover-launcher="true"]').dispatchEvent({ type: 'click' });
    const panel = document.querySelector('#fields-mover-panel');
    const action = async (name) => {
      panel.dispatchEvent({ type: 'click', target: panel.querySelector(`[data-action="${name}"]`) });
      await new Promise(setImmediate);
    };
    await action('read');
    await action('select-visible');
    await action('copy');
    const toggle = panel.querySelector('[data-role="clipboard-mode"]');
    assert.ok(toggle);
    toggle.checked = true;
    toggle.dispatchEvent({ type: 'change' });
    currentFields = [{ fieldId: 'clipboard-only', label: '导出' }];
    await action('read');
    await action('select-visible');
    await action('copy-clipboard');
    const failed = mode === 'false' || mode === 'throws';
    assert.match(panel.querySelector('.fm-status').textContent,
      failed ? /写入剪贴板失败/ : /到剪贴板/);
    if (failed) assert.ok(warnings.length > 0);
    else assert.deepEqual(JSON.parse(clipboardText), [{ fieldId: 'clipboard-only', label: '导出', isProduct: 0, id: 'copied-id' }]);
    assert.equal(document.documentElement.children.some((element) => element.tagName === 'TEXTAREA'), false);
    assert.equal(document.activeElement, originalFocus);
    assert.deepEqual(ranges, [range]);
    currentFields = destination;
    toggle.checked = false;
    toggle.dispatchEvent({ type: 'change' });
    await action('paste');
    assert.deepEqual(destination, [{ fieldId: 'name', label: '名称', isProduct: 0, id: 'copied-id' }]);
  });
}


function setupCopyPanel() {
  const document = new FakeDocument();
  const toolbar = document.createElement('div');
  toolbar.className = 'popular-func';
  document.documentElement.appendChild(toolbar);
  const fields = [{ fieldId: 'source', label: '来源', calculate: () => 42 }];
  let target = { fields, vue: { $gUtil: { GUID: () => 'new-id' } } };
  let clipboardCalls = 0;
  runContentScript(document, (context) => {
    context.navigator.clipboard.writeText = async () => { clipboardCalls += 1; };
    context.JSON = { stringify() { throw new Error('default copy must not serialize'); }, parse: JSON.parse };
    context.window.FieldsMoverCore = {
      ...require('./fields-core.js'),
      findFieldsContext: () => {
        if (!target) throw new Error('没有目标组件');
        return target;
      },
    };
  });
  const launcher = document.querySelector('[data-fields-mover-launcher="true"]');
  launcher.dispatchEvent({ type: 'click' });
  const panel = document.querySelector('#fields-mover-panel');
  return {
    panel, fields, launcher,
    get clipboardCalls() { return clipboardCalls; },
    setTarget(value) { target = value; },
    async action(name) {
      panel.dispatchEvent({ type: 'click', target: panel.querySelector(`[data-action="${name}"]`) });
      await new Promise(setImmediate);
    },
    toggle(checked) {
      const toggle = panel.querySelector('[data-role="clipboard-mode"]');
      assert.ok(toggle);
      toggle.checked = checked;
      toggle.dispatchEvent({ type: 'change' });
    },
  };
}

test('default copy stays in memory and preserves non-JSON members', async () => {
  const setup = setupCopyPanel();
  await setup.action('read');
  await setup.action('select-visible');
  await setup.action('copy');
  assert.match(setup.panel.querySelector('.fm-status').textContent, /已复制 1/);
  assert.equal(setup.clipboardCalls, 0);
  const destination = [];
  setup.setTarget({ fields: destination });
  await setup.action('paste');
  assert.equal(destination.length, 1);
  assert.equal(destination[0].calculate, setup.fields[0].calculate);
});

test('mode switches buttons and cancels JSON entry without clearing cache', async () => {
  const setup = setupCopyPanel();
  const { panel } = setup;
  const button = (name) => panel.querySelector(`[data-action="${name}"]`);
  assert.equal(button('copy').hidden, false);
  assert.equal(button('copy-clipboard').hidden, true);
  setup.toggle(true);
  assert.equal(button('copy').hidden, true);
  assert.equal(button('copy-clipboard').hidden, false);
  await setup.action('paste-clipboard');
  const input = panel.querySelector('[data-role="json-input"]');
  const editor = panel.querySelector('[data-role="json-editor"]');
  assert.equal(editor.hidden, false);
  assert.equal(input.focused, true);
  input.value = 'draft';
  await setup.action('cancel-json');
  assert.equal(editor.hidden, true);
  assert.equal(input.value, '');
  await setup.action('paste-clipboard');
  input.value = 'another draft';
  setup.toggle(false);
  assert.equal(editor.hidden, true);
  assert.equal(input.value, '');
  setup.toggle(true);
  await setup.action('close');
  setup.launcher.dispatchEvent({ type: 'click' });
  assert.equal(button('copy-clipboard').hidden, false);
});

for (const value of ['', '{', '{}', '[null]', '[1]', '[[]]']) {
  test(`JSON paste rejects invalid structure ${JSON.stringify(value)} without changing target`, async () => {
    const setup = setupCopyPanel();
    setup.toggle(true);
    await setup.action('paste-clipboard');
    const input = setup.panel.querySelector('[data-role="json-input"]');
    input.value = value;
    await setup.action('confirm-json');
    assert.equal(setup.fields.length, 1);
    assert.equal(input.value, value);
    assert.equal(setup.panel.querySelector('[data-role="json-editor"]').hidden, false);
    assert.ok(setup.panel.querySelector('[data-role="json-error"]').textContent);
  });
}

test('JSON paste regenerates ids, skips duplicates and invalid fields, and keeps memory cache', async () => {
  const setup = setupCopyPanel();
  await setup.action('read');
  await setup.action('select-visible');
  await setup.action('copy');
  setup.toggle(true);
  await setup.action('paste-clipboard');
  const input = setup.panel.querySelector('[data-role="json-input"]');
  input.value = '[{"fieldId":"imported","id":"old","guid":"old-guid","isProduct":1},{"fieldId":"source"},{}]';
  await setup.action('confirm-json');
  assert.equal(setup.fields.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(setup.fields[1])), { fieldId: 'imported', id: 'new-id', isProduct: 0 });
  assert.match(setup.panel.querySelector('.fm-status').textContent, /已添加 1 个，跳过重复 1 个，跳过无效 1 个/);
  assert.equal(input.value, '');
  assert.equal(setup.panel.querySelector('[data-role="json-editor"]').hidden, true);
  setup.toggle(false);
  const destination = [];
  setup.setTarget({ fields: destination });
  await setup.action('paste');
  assert.equal(destination[0].fieldId, 'source');
});

for (const failure of ['missing-target', 'guid-failure']) {
  test(`JSON paste ${failure} preserves input and target`, async () => {
    const setup = setupCopyPanel();
    const targetFields = [];
    let calls = 0;
    setup.setTarget(failure === 'missing-target' ? null : {
      fields: targetFields,
      vue: { $gUtil: { GUID() { if (++calls === 2) throw new Error('GUID failed'); return 'one'; } } },
    });
    setup.toggle(true);
    await setup.action('paste-clipboard');
    const input = setup.panel.querySelector('[data-role="json-input"]');
    input.value = '[{"fieldId":"a"},{"fieldId":"b"}]';
    await setup.action('confirm-json');
    assert.equal(targetFields.length, 0);
    assert.equal(input.value, '[{"fieldId":"a"},{"fieldId":"b"}]');
    assert.ok(setup.panel.querySelector('[data-role="json-error"]').textContent);
  });
}
