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

  function createDocumentStub() {
    const eventTarget = new EventTarget();
    return {
      querySelectorAll: jest.fn(() => []),
      body: {},
      documentElement: document.documentElement,
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget)
    };
  }

  test('registers completion provider on available languages', () => {
    // Pre-load completion-provider so __createCompletionProvider exists
    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = createDocumentStub();
    ctx.document.body = { childList: true };
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
    ctx.__createSignatureHelpProvider = function () {
      return {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp: jest.fn(() => null)
      };
    };

    loadScript('injected.js', ctx);

    // Should have tried to register on 'sql' and 'plaintext' (which exist in mock)
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalled();
    const calls = monaco.languages.registerCompletionItemProvider.mock.calls;
    const registeredLangs = calls.map(c => c[0]);
    expect(registeredLangs).toContain('plaintext');
    expect(registeredLangs).toContain('sql');
    expect(monaco.languages.registerSignatureHelpProvider).toHaveBeenCalled();
    expect(monaco.languages.setLanguageConfiguration).toHaveBeenCalled();
    const sqlConfigCall = monaco.languages.setLanguageConfiguration.mock.calls.find(
      (call) => call[0] === 'sql'
    );
    expect(sqlConfigCall).toBeDefined();
    expect(sqlConfigCall[1].brackets).toEqual([['(', ')']]);
    expect(sqlConfigCall[1].autoClosingPairs).toEqual([
      { open: '(', close: ')' },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string', 'comment'] }
    ]);
  });

  test('configures existing editors on init', () => {
    const editor = createMockEditor({ languageId: 'plsql', content: 'DECLARE' });
    monaco.__test.addEditor(editor);

    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = createDocumentStub();
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
    expect(opts.fixedOverflowWidgets).toBe(true);
    expect(opts.autoClosingBrackets).toBe('always');
    expect(opts.autoClosingQuotes).toBe('always');
    expect(opts.autoSurround).toBe('languageDefined');
    expect(opts.matchBrackets).toBe('always');
  });

  test('skips non-PL/SQL editors (JavaScript)', () => {
    const jsEditor = createMockEditor({ languageId: 'javascript', content: 'function test() {}' });
    monaco.__test.addEditor(jsEditor);

    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = createDocumentStub();
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
    ctx.document = createDocumentStub();
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
    expect(ctx.__apexAutocompleteSettings.completionCase).toBe('upper');
  });

  test('watches for new editors with onDidCreateEditor', () => {
    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = createDocumentStub();
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
    ctx.document = createDocumentStub();
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

  test('updates completion case from page event', () => {
    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = createDocumentStub();
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.clearInterval = clearInterval;
    ctx.setInterval = setInterval;
    ctx.WeakSet = WeakSet;
    ctx.Object = Object;
    ctx.JSON = JSON;
    ctx.Array = Array;
    ctx.CustomEvent = CustomEvent;
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
    ctx.document.dispatchEvent(new CustomEvent('__apexSetCompletionCase', {
      detail: JSON.stringify({ completionCase: 'lower' })
    }));

    expect(ctx.__apexAutocompleteSettings.completionCase).toBe('lower');
  });
});
