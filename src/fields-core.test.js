const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = require('./fields-core');

function createElement({ className = '', vue = undefined, children = [] } = {}) {
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  const element = {
    className,
    children: [],
    matches(selector) {
      return selector
        .split('.')
        .filter(Boolean)
        .every((classPart) => classes.has(classPart));
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const matches = [];

      function visit(node) {
        for (const child of node.children) {
          if (selector === '*' || child.matches(selector)) {
            matches.push(child);
          }
          visit(child);
        }
      }

      visit(this);
      return matches;
    },
  };

  if (vue !== undefined) {
    element.__vue__ = vue;
  }

  for (const child of children) {
    element.children.push(child);
  }

  return element;
}

function createDocument(children = []) {
  return createElement({ children });
}

test('findFieldsContext returns selected shell input-box Vue fields', () => {
  const fields = [{ fieldId: 'a1', label: 'Amount' }];
  const columns = [{ fieldId: 'wrong', label: 'Wrong column' }];
  const host = createElement({
    className: 'input-box',
    vue: { fields, columns },
  });
  const shell = createElement({
    className: 'base-control-box row-box selected',
    children: [host],
  });
  const rootDocument = createDocument([shell]);

  const context = core.findFieldsContext(rootDocument);

  assert.equal(context.shell, shell);
  assert.equal(context.host, host);
  assert.equal(context.vue, host.__vue__);
  assert.equal(context.fieldsKey, 'fields');
  assert.equal(context.fields, fields);
});

test('findFieldsContext returns selected shell coust-table Vue columns', () => {
  const fields = [{ fieldId: 'wrong', label: 'Wrong field' }];
  const columns = [{ fieldId: 'col1', label: 'Column field' }];
  const host = createElement({
    className: 'coust-table',
    vue: { fields, columns },
  });
  const shell = createElement({
    className: 'base-control-box row-box selected',
    children: [createElement({ className: 'table-wrapper', children: [host] })],
  });

  const context = core.findFieldsContext(createDocument([shell]));

  assert.equal(context.host, host);
  assert.equal(context.fieldsKey, 'columns');
  assert.equal(context.fields, columns);
});

test('findFieldsContext does not guess unsupported descendant fields hosts', () => {
  const fields = [{ fieldId: 'deep1', label: 'Deep field' }];
  const deepHost = createElement({
    className: 'unknown-table-inner',
    vue: { fields },
  });
  const shell = createElement({
    className: 'base-control-box row-box selected',
    children: [
      createElement({
        className: 'wrapper',
        children: [createElement({ className: 'body', children: [deepHost] })],
      }),
    ],
  });

  assert.throws(
    () => core.findFieldsContext(createDocument([shell])),
    /Selected component does not contain a supported fields host\./
  );
});

test('fields-core script attaches to globalThis without CommonJS module', () => {
  const source = fs.readFileSync(path.join(__dirname, 'fields-core.js'), 'utf8');
  const context = { globalThis: {} };

  assert.doesNotThrow(() => vm.runInNewContext(source, context));

  const browserCore = context.globalThis.FieldsMoverCore || context.FieldsMoverCore;
  assert.equal(typeof browserCore.findFieldsContext, 'function');
});

test('findFieldsContext throws when no selected shell exists', () => {
  const rootDocument = createDocument([
    createElement({ className: 'base-control-box row-box' }),
  ]);

  assert.throws(
    () => core.findFieldsContext(rootDocument),
    /No selected component found/
  );
});

test('findFieldsContext throws when multiple selected shells exist', () => {
  const rootDocument = createDocument([
    createElement({ className: 'base-control-box row-box selected' }),
    createElement({ className: 'base-control-box row-box selected' }),
  ]);

  assert.throws(
    () => core.findFieldsContext(rootDocument),
    /More than one selected component found/
  );
});

test('findFieldsContext throws when selected shell has no fields host', () => {
  const rootDocument = createDocument([
    createElement({ className: 'base-control-box row-box selected' }),
  ]);

  assert.throws(
    () => core.findFieldsContext(rootDocument),
    /Selected component does not contain a supported fields host\./
  );
});

test('findFieldsContext throws when Vue fields is not an array', () => {
  const host = createElement({
    className: 'input-box',
    vue: { fields: { fieldId: 'not-array' } },
  });
  const shell = createElement({
    className: 'base-control-box row-box selected',
    children: [host],
  });

  assert.throws(
    () => core.findFieldsContext(createDocument([shell])),
    /Vue fields or columns is not an array\./
  );
});

test('getVueFromHost searches descendants before falling back to host Vue', () => {
  const childVue = { fields: [{ fieldId: 'child' }] };
  const hostVue = { fields: { invalid: true } };
  const child = createElement({ className: 'nested', vue: childVue });
  const host = createElement({
    className: 'input-box',
    vue: hostVue,
    children: [child],
  });

  assert.equal(core.getVueFromHost(host), childVue);
});

test('planAppendFields separates appended, duplicate, and invalid fields', () => {
  const add = { fieldId: 'b', label: 'B' };
  const duplicateTarget = { fieldId: 1, label: 'Duplicate target' };
  const duplicateBatch = { fieldId: 'b', label: 'Duplicate batch' };
  const missingId = { label: 'Missing id' };

  const plan = core.planAppendFields(
    [{ fieldId: '1' }],
    [add, duplicateTarget, missingId, duplicateBatch, { fieldId: 0 }]
  );

  assert.deepEqual(plan.toAppend, [add]);
  assert.deepEqual(plan.skippedDuplicate, [duplicateTarget, duplicateBatch]);
  assert.deepEqual(plan.skippedInvalid, [missingId, { fieldId: 0 }]);
});

test('cloneFields deep copies JSON-compatible field data', () => {
  const fields = [{ fieldId: 'a', nested: { value: 1 } }];

  const cloned = core.cloneFields(fields);
  cloned[0].nested.value = 2;

  assert.deepEqual(fields, [{ fieldId: 'a', nested: { value: 1 } }]);
  assert.deepEqual(cloned, [{ fieldId: 'a', nested: { value: 2 } }]);
});

test('cloneFields preserves non-JSON field members for in-memory paste', () => {
  const formatter = (value) => value;
  const fields = [{
    fieldId: 'a',
    formatter,
    defaultValue: undefined,
    nested: { visible: undefined },
  }];

  const cloned = core.cloneFields(fields);

  assert.notEqual(cloned[0], fields[0]);
  assert.equal(cloned[0].formatter, formatter);
  assert.ok(Object.hasOwn(cloned[0], 'defaultValue'));
  assert.equal(cloned[0].defaultValue, undefined);
  assert.ok(Object.hasOwn(cloned[0].nested, 'visible'));
});

test('createFieldSummary returns title and subtitle display text', () => {
  assert.deepEqual(core.createFieldSummary({ label: 'Amount', key: 'amount' }, 0), {
    index: 0,
    fieldId: undefined,
    title: 'Amount',
    subtitle: 'key: amount',
  });

  assert.deepEqual(core.createFieldSummary({ fieldId: 42 }, 2), {
    index: 2,
    fieldId: 42,
    title: 42,
    subtitle: 'fieldId: 42',
  });

  assert.deepEqual(core.createFieldSummary({}, 3), {
    index: 3,
    fieldId: undefined,
    title: 'Field 4',
    subtitle: 'fieldId: missing',
  });
});
