/**
 * Test helpers: mocks for Chrome APIs, Monaco editor, and script loader.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Create a mock Monaco editor API.
 */
function createMockMonaco() {
  const CompletionItemKind = {
    Keyword: 17, Text: 0, Function: 1, Method: 0, Variable: 4,
    Snippet: 27, Property: 9, TypeParameter: 24, Struct: 6,
    Event: 7, Module: 8
  };
  const InsertAsSnippet = 4;

  const editors = [];
  const registeredProviders = [];
  const registeredLanguages = [
    { id: 'plaintext' }, { id: 'javascript' }, { id: 'sql' }
  ];

  const editorCallbacks = [];

  return {
    languages: {
      CompletionItemKind: CompletionItemKind,
      CompletionItemInsertTextRule: { InsertAsSnippet: InsertAsSnippet },
      registerCompletionItemProvider: jest.fn(function (langId, provider) {
        registeredProviders.push({ langId, provider });
        return { dispose: jest.fn() };
      }),
      getLanguages: jest.fn(function () { return registeredLanguages; }),
      typescript: {
        javascriptDefaults: {
          addExtraLib: jest.fn()
        }
      }
    },
    editor: {
      getEditors: jest.fn(function () { return editors; }),
      setModelLanguage: jest.fn(),
      onDidCreateEditor: jest.fn(function (cb) { editorCallbacks.push(cb); }),
      create: jest.fn()
    },
    // Test helpers (not part of real Monaco API)
    __test: {
      editors: editors,
      registeredProviders: registeredProviders,
      registeredLanguages: registeredLanguages,
      editorCallbacks: editorCallbacks,
      addEditor: function (editor) { editors.push(editor); }
    }
  };
}

/**
 * Create a mock Monaco editor instance.
 */
function createMockEditor(options) {
  options = options || {};
  var languageId = options.languageId || 'plaintext';
  var content = options.content || '';

  var model = {
    getLanguageId: jest.fn(function () { return languageId; }),
    getValue: jest.fn(function () { return content; }),
    getLineContent: jest.fn(function (lineNum) {
      var lines = content.split('\n');
      return lines[lineNum - 1] || '';
    }),
    getWordUntilPosition: jest.fn(function (position) {
      return { word: '', startColumn: position.column, endColumn: position.column };
    })
  };

  return {
    getModel: jest.fn(function () { return model; }),
    getDomNode: jest.fn(function () { return options.domNode || null; }),
    updateOptions: jest.fn(),
    __model: model
  };
}

/**
 * Create a mock Chrome runtime API.
 */
function createMockChrome() {
  return {
    runtime: {
      getURL: jest.fn(function (file) { return 'chrome-extension://fakeid/' + file; }),
      onMessage: {
        addListener: jest.fn()
      },
      lastError: null,
      sendMessage: jest.fn()
    },
    tabs: {
      query: jest.fn(),
      sendMessage: jest.fn()
    }
  };
}

/**
 * Load and execute a script file in a given context (sandbox).
 * Returns the context so you can inspect globals set by the script.
 */
function loadScript(filePath, context) {
  context = context || {};

  // Provide default globals if not set
  if (!context.window) context.window = context;
  if (!context.console) context.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  if (!context.document) context.document = global.document;
  if (!context.setTimeout) context.setTimeout = setTimeout;
  if (!context.clearInterval) context.clearInterval = clearInterval;
  if (!context.setInterval) context.setInterval = setInterval;
  if (!context.CustomEvent) context.CustomEvent = CustomEvent;
  if (!context.MutationObserver) {
    context.MutationObserver = jest.fn(function () {
      return { observe: jest.fn(), disconnect: jest.fn() };
    });
  }
  if (!context.WeakSet) context.WeakSet = WeakSet;
  if (!context.Promise) context.Promise = Promise;
  if (!context.Object) context.Object = Object;
  if (!context.JSON) context.JSON = JSON;
  if (!context.Array) context.Array = Array;

  var absolutePath = path.resolve(__dirname, '..', filePath);
  var code = fs.readFileSync(absolutePath, 'utf8');

  var sandbox = vm.createContext(context);
  vm.runInContext(code, sandbox, { filename: filePath });

  return context;
}

module.exports = {
  createMockMonaco: createMockMonaco,
  createMockEditor: createMockEditor,
  createMockChrome: createMockChrome,
  loadScript: loadScript
};
