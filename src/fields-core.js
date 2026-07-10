const SELECTED_SHELL_SELECTOR = '.base-control-box.row-box.selected';
const INPUT_BOX_SELECTOR = '.input-box';
const FIELD_HOST_RULES = [
  { selector: '.input-box', fieldsKey: 'fields' },
  { selector: '.coust-table', fieldsKey: 'columns' },
];

function cloneFields(fields) {
  return cloneFieldValue(fields, new Map());
}

function cloneFieldValue(value, seen) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (Array.isArray(value)) {
    const clonedArray = [];
    seen.set(value, clonedArray);
    for (const item of value) {
      clonedArray.push(cloneFieldValue(item, seen));
    }
    return clonedArray;
  }

  const clonedObject = {};
  seen.set(value, clonedObject);

  for (const key of Object.keys(value)) {
    clonedObject[key] = cloneFieldValue(value[key], seen);
  }

  return clonedObject;
}

function firstPresentValue(field, keys) {
  for (const key of keys) {
    if (field && field[key]) {
      return field[key];
    }
  }

  return undefined;
}

function createFieldSummary(field, index) {
  const fieldId = field && field.fieldId;
  const title =
    firstPresentValue(field, [
      'label',
      'name',
      'title',
      'fieldName',
      'key',
      'fieldId',
    ]) || `Field ${index + 1}`;

  const subtitleKey = ['key', 'prop', 'field', 'columnName'].find(
    (key) => field && field[key]
  );
  const subtitle = subtitleKey
    ? `${subtitleKey}: ${field[subtitleKey]}`
    : `fieldId: ${fieldId || 'missing'}`;

  return {
    index,
    fieldId,
    title,
    subtitle,
  };
}

function getFieldsKeyFromVue(vue, expectedKey) {
  if (!vue || !expectedKey) {
    return null;
  }

  return Array.isArray(vue[expectedKey]) ? expectedKey : null;
}

function getFieldsArrayFromVue(vue, expectedKey) {
  const fieldsKey = getFieldsKeyFromVue(vue, expectedKey);
  return fieldsKey ? vue[fieldsKey] : null;
}

function vueHasFieldsArray(candidate, fieldsKey) {
  return !!(
    candidate &&
    candidate.__vue__ &&
    getFieldsArrayFromVue(candidate.__vue__, fieldsKey)
  );
}

function findFieldsHost(shell) {
  for (const { selector, fieldsKey } of FIELD_HOST_RULES) {
    const host = shell.querySelector(selector);
    if (host && getVueFromHost(host, fieldsKey)) {
      return {
        host,
        fieldsKey,
      };
    }
  }

  return null;
}

function getVueFromHost(host, fieldsKey = 'fields') {
  if (!host) {
    return null;
  }

  if (host.__vue__ && getFieldsArrayFromVue(host.__vue__, fieldsKey)) {
    return host.__vue__;
  }

  if (typeof host.querySelectorAll === 'function') {
    const descendants = host.querySelectorAll('*');
    for (const candidate of descendants) {
      if (vueHasFieldsArray(candidate, fieldsKey)) {
        return candidate.__vue__;
      }
    }
  }

  return host.__vue__ || null;
}

function findFieldsContext(rootDocument) {
  const selectedShells = rootDocument.querySelectorAll(SELECTED_SHELL_SELECTOR);

  if (selectedShells.length === 0) {
    throw new Error('未找到选中的组件，请先选择一个组件。');
  }

  if (selectedShells.length > 1) {
    throw new Error('More than one selected component found. Please select only one component.');
  }

  const shell = selectedShells[0];
  const hostContext = findFieldsHost(shell);

  if (!hostContext) {
    throw new Error('Selected component does not contain a supported fields host.');
  }

  const { host, fieldsKey } = hostContext;
  const vue = getVueFromHost(host, fieldsKey);

  if (!vue) {
    throw new Error('No Vue instance with fields found from the selected component.');
  }

  const fields = getFieldsArrayFromVue(vue, fieldsKey);

  if (!fields) {
    throw new Error('Vue fields or columns is not an array.');
  }

  return {
    shell,
    host,
    vue,
    fields,
    fieldsKey,
  };
}

function planAppendFields(targetFields, copiedFields) {
  const seenFieldIds = new Set(
    targetFields
      .filter((field) => field && field.fieldId)
      .map((field) => String(field.fieldId))
  );
  const toAppend = [];
  const skippedDuplicate = [];
  const skippedInvalid = [];

  for (const field of copiedFields) {
    if (!field || !field.fieldId) {
      skippedInvalid.push(field);
      continue;
    }

    const fieldId = String(field.fieldId);
    if (seenFieldIds.has(fieldId)) {
      skippedDuplicate.push(field);
      continue;
    }

    seenFieldIds.add(fieldId);
    toAppend.push(field);
  }

  return {
    toAppend,
    skippedDuplicate,
    skippedInvalid,
  };
}

const FieldsMoverCore = {
  SELECTED_SHELL_SELECTOR,
  INPUT_BOX_SELECTOR,
  FIELD_HOST_RULES,
  cloneFields,
  cloneFieldValue,
  createFieldSummary,
  findFieldsHost,
  findFieldsContext,
  getFieldsArrayFromVue,
  getFieldsKeyFromVue,
  getVueFromHost,
  planAppendFields,
};

if (typeof globalThis !== 'undefined') {
  globalThis.FieldsMoverCore = FieldsMoverCore;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FieldsMoverCore;
}
