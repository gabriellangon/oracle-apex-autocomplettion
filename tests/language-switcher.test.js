/**
 * Tests for language-switcher.js
 * Validates editor listing and language switching via DOM events.
 *
 * Each test creates a fresh mock document (EventTarget) to avoid
 * listener leaks between tests.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createMockMonaco, createMockEditor } = require('./helpers');

function createMockDocument() {
  const target = new EventTarget();
  return {
    addEventListener: (type, fn) => target.addEventListener(type, fn),
    removeEventListener: (type, fn) => target.removeEventListener(type, fn),
    dispatchEvent: (evt) => target.dispatchEvent(evt)
  };
}

function loadSwitcher(monaco, mockDoc) {
  const ctx = {};
  ctx.window = ctx;
  ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  ctx.JSON = JSON;
  ctx.Object = Object;
  ctx.Array = Array;
  ctx.document = mockDoc;
  ctx.CustomEvent = CustomEvent;
  ctx.monaco = monaco;

  const code = fs.readFileSync(
    path.resolve(__dirname, '..', 'language-switcher.js'), 'utf8'
  );
  const sandbox = vm.createContext(ctx);
  vm.runInContext(code, sandbox, { filename: 'language-switcher.js' });
  return { ctx, mockDoc };
}

describe('language-switcher', () => {
  test('responds to __apexGetEditors event with editor info', (done) => {
    const monaco = createMockMonaco();
    const editor = createMockEditor({ languageId: 'plsql' });
    monaco.__test.addEditor(editor);

    const mockDoc = createMockDocument();
    loadSwitcher(monaco, mockDoc);

    mockDoc.addEventListener('__apexEditorsResult', function handler(e) {
      mockDoc.removeEventListener('__apexEditorsResult', handler);
      const data = JSON.parse(e.detail);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].index).toBe(0);
      expect(data[0].language).toBe('plsql');
      done();
    });

    mockDoc.dispatchEvent(new CustomEvent('__apexGetEditors'));
  });

  test('returns empty array when no Monaco', (done) => {
    const mockDoc = createMockDocument();
    // Load with no monaco
    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.JSON = JSON;
    ctx.Object = Object;
    ctx.Array = Array;
    ctx.document = mockDoc;
    ctx.CustomEvent = CustomEvent;
    // No monaco set

    const code = fs.readFileSync(
      path.resolve(__dirname, '..', 'language-switcher.js'), 'utf8'
    );
    vm.runInContext(code, vm.createContext(ctx), { filename: 'language-switcher.js' });

    mockDoc.addEventListener('__apexEditorsResult', function handler(e) {
      mockDoc.removeEventListener('__apexEditorsResult', handler);
      const data = JSON.parse(e.detail);
      expect(data).toEqual([]);
      done();
    });

    mockDoc.dispatchEvent(new CustomEvent('__apexGetEditors'));
  });

  test('responds to __apexSetLanguage event', (done) => {
    const monaco = createMockMonaco();
    const editor = createMockEditor({ languageId: 'plaintext' });
    monaco.__test.addEditor(editor);

    const mockDoc = createMockDocument();
    loadSwitcher(monaco, mockDoc);

    mockDoc.addEventListener('__apexSetLanguageResult', function handler(e) {
      mockDoc.removeEventListener('__apexSetLanguageResult', handler);
      const result = JSON.parse(e.detail);
      expect(result.success).toBe(true);
      expect(monaco.editor.setModelLanguage).toHaveBeenCalledWith(
        editor.getModel(),
        'plsql'
      );
      done();
    });

    mockDoc.dispatchEvent(new CustomEvent('__apexSetLanguage', {
      detail: JSON.stringify({ editorIndex: 0, languageId: 'plsql' })
    }));
  });

  test('returns false for invalid editor index', (done) => {
    const monaco = createMockMonaco();
    const mockDoc = createMockDocument();
    loadSwitcher(monaco, mockDoc);

    mockDoc.addEventListener('__apexSetLanguageResult', function handler(e) {
      mockDoc.removeEventListener('__apexSetLanguageResult', handler);
      const result = JSON.parse(e.detail);
      expect(result.success).toBe(false);
      done();
    });

    mockDoc.dispatchEvent(new CustomEvent('__apexSetLanguage', {
      detail: JSON.stringify({ editorIndex: 99, languageId: 'sql' })
    }));
  });

  test('reports multiple editors', (done) => {
    const monaco = createMockMonaco();
    const editor1 = createMockEditor({ languageId: 'plsql' });
    const editor2 = createMockEditor({ languageId: 'javascript' });
    monaco.__test.addEditor(editor1);
    monaco.__test.addEditor(editor2);

    const mockDoc = createMockDocument();
    loadSwitcher(monaco, mockDoc);

    mockDoc.addEventListener('__apexEditorsResult', function handler(e) {
      mockDoc.removeEventListener('__apexEditorsResult', handler);
      const data = JSON.parse(e.detail);
      expect(data.length).toBe(2);
      expect(data[0].language).toBe('plsql');
      expect(data[1].language).toBe('javascript');
      done();
    });

    mockDoc.dispatchEvent(new CustomEvent('__apexGetEditors'));
  });
});
