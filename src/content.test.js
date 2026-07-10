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

class FakeDocument extends FakeElement {
  constructor() {
    super('#document');
    this.documentElement = new FakeElement('html');
    this.appendChild(this.documentElement);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

function runContentScript(document) {
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
  assert.equal(launcher.textContent, '复制面板');
  assert.equal(document.querySelector('#fields-mover-panel'), null);

  launcher.dispatchEvent({ type: 'click' });

  const panel = document.querySelector('#fields-mover-panel');
  assert.ok(panel);
  assert.deepEqual(
    panel.querySelectorAll('button').map((button) => button.textContent),
    [
      '读取当前选中组件字段',
      '选择可见字段',
      '清空选择',
      '复制选中字段 JSON',
      '粘贴到当前组件字段'
    ]
  );
});
