/**
 * Tests for injected.js
 * Validates language detection, provider registration, and editor configuration.
 *
 * Since injected.js uses an IIFE that calls init() immediately,
 * we test its internal logic by setting up the required globals first.
 */
const { loadScript, createMockMonaco, createMockEditor } = require('./helpers');

describe('injected.js', () => {
  let monaco;

  beforeEach(() => {
    monaco = createMockMonaco();
  });

  test('registers completion provider on available languages', () => {
    // Pre-load completion-provider so __createCompletionProvider exists
    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = {
      querySelectorAll: jest.fn(() => []),
      body: { childList: true },
      documentElement: document.documentElement
    };
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.clearInterval = clearInterval;
    ctx.setInterval = setInterval;
    ctx.WeakSet = WeakSet;
    ctx.Object = Object;
    ctx.JSON = JSON;
    ctx.Array = Array;
    ctx.MutationObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }));
    ctx.monaco = monaco;

    // Simulate the completion-provider having been loaded
    ctx.__createCompletionProvider = function (m) {
      return {
        triggerCharacters: ['.'],
        provideCompletionItems: jest.fn(() => ({ suggestions: [] }))
      };
    };

    loadScript('injected.js', ctx);

    // Should have tried to register on 'sql' and 'plaintext' (which exist in mock)
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalled();
    const calls = monaco.languages.registerCompletionItemProvider.mock.calls;
    const registeredLangs = calls.map(c => c[0]);
    expect(registeredLangs).toContain('plaintext');
    expect(registeredLangs).toContain('sql');
  });

  test('configures existing editors on init', () => {
    const editor = createMockEditor({ languageId: 'plsql', content: 'DECLARE' });
    monaco.__test.addEditor(editor);

    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = {
      querySelectorAll: jest.fn(() => []),
      body: {},
      documentElement: document.documentElement
    };
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.clearInterval = clearInterval;
    ctx.setInterval = setInterval;
    ctx.WeakSet = WeakSet;
    ctx.Object = Object;
    ctx.JSON = JSON;
    ctx.Array = Array;
    ctx.MutationObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }));
    ctx.monaco = monaco;
    ctx.__createCompletionProvider = function () {
      return {
        triggerCharacters: ['.'],
        provideCompletionItems: jest.fn(() => ({ suggestions: [] }))
      };
    };

    loadScript('injected.js', ctx);

    // Editor should have been configured with autocomplete options
    expect(editor.updateOptions).toHaveBeenCalled();
    const opts = editor.updateOptions.mock.calls[0][0];
    expect(opts.quickSuggestions).toBeDefined();
    expect(opts.suggestOnTriggerCharacters).toBe(true);
  });

  test('skips non-PL/SQL editors (JavaScript)', () => {
    const jsEditor = createMockEditor({ languageId: 'javascript', content: 'function test() {}' });
    monaco.__test.addEditor(jsEditor);

    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = {
      querySelectorAll: jest.fn(() => []),
      body: {},
      documentElement: document.documentElement
    };
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.clearInterval = clearInterval;
    ctx.setInterval = setInterval;
    ctx.WeakSet = WeakSet;
    ctx.Object = Object;
    ctx.JSON = JSON;
    ctx.Array = Array;
    ctx.MutationObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }));
    ctx.monaco = monaco;
    ctx.__createCompletionProvider = function () {
      return {
        triggerCharacters: ['.'],
        provideCompletionItems: jest.fn(() => ({ suggestions: [] }))
      };
    };

    loadScript('injected.js', ctx);

    // JS editor should NOT have updateOptions called (skipped)
    expect(jsEditor.updateOptions).not.toHaveBeenCalled();
  });

  test('sets __apexAutocompleteActive guard flag', () => {
    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = {
      querySelectorAll: jest.fn(() => []),
      body: {},
      documentElement: document.documentElement
    };
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.clearInterval = clearInterval;
    ctx.setInterval = setInterval;
    ctx.WeakSet = WeakSet;
    ctx.Object = Object;
    ctx.JSON = JSON;
    ctx.Array = Array;
    ctx.MutationObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }));
    ctx.monaco = monaco;
    ctx.__createCompletionProvider = function () {
      return {
        triggerCharacters: ['.'],
        provideCompletionItems: jest.fn(() => ({ suggestions: [] }))
      };
    };

    loadScript('injected.js', ctx);
    expect(ctx.__apexAutocompleteActive).toBe(true);
  });

  test('watches for new editors with onDidCreateEditor', () => {
    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = {
      querySelectorAll: jest.fn(() => []),
      body: {},
      documentElement: document.documentElement
    };
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.clearInterval = clearInterval;
    ctx.setInterval = setInterval;
    ctx.WeakSet = WeakSet;
    ctx.Object = Object;
    ctx.JSON = JSON;
    ctx.Array = Array;
    ctx.MutationObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }));
    ctx.monaco = monaco;
    ctx.__createCompletionProvider = function () {
      return {
        triggerCharacters: ['.'],
        provideCompletionItems: jest.fn(() => ({ suggestions: [] }))
      };
    };

    loadScript('injected.js', ctx);
    expect(monaco.editor.onDidCreateEditor).toHaveBeenCalled();
  });

  test('sets up MutationObserver for dynamic editors', () => {
    const mockObserve = jest.fn();
    const MockMO = jest.fn(() => ({
      observe: mockObserve,
      disconnect: jest.fn()
    }));

    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = {
      querySelectorAll: jest.fn(() => []),
      body: {},
      documentElement: document.documentElement
    };
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.clearInterval = clearInterval;
    ctx.setInterval = setInterval;
    ctx.WeakSet = WeakSet;
    ctx.Object = Object;
    ctx.JSON = JSON;
    ctx.Array = Array;
    ctx.MutationObserver = MockMO;
    ctx.monaco = monaco;
    ctx.__createCompletionProvider = function () {
      return {
        triggerCharacters: ['.'],
        provideCompletionItems: jest.fn(() => ({ suggestions: [] }))
      };
    };

    loadScript('injected.js', ctx);
    expect(MockMO).toHaveBeenCalled();
    expect(mockObserve).toHaveBeenCalled();
  });
});
