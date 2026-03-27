/**
 * Tests for content-script.js
 * Validates injection logic, message bridge, and Monaco detection.
 */
const { createMockChrome } = require('./helpers');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('content-script', () => {
  let chrome;
  let ctx;

  function buildContext(options) {
    options = options || {};
    chrome = createMockChrome();
    const scriptElements = [];
    const url = new URL(options.href || 'https://oracleapex.com/ords/r/apex/app-builder/page-designer');

    ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.chrome = chrome;
    ctx.location = {
      href: url.href,
      pathname: url.pathname,
      search: url.search
    };
    ctx.JSON = JSON;
    ctx.Object = Object;
    ctx.Array = Array;
    ctx.Promise = Promise;
    ctx.CustomEvent = CustomEvent;
    ctx.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ keywords: [] }) })
    );
    chrome.storage.sync.get.mockImplementation((defaults, cb) => {
      cb({ completionCase: options.completionCase || defaults.completionCase || 'upper' });
    });

    // Mock document with event support + script injection
    const eventTarget = new EventTarget();
    ctx.document = {
      readyState: 'complete',
      createElement: jest.fn((tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          src: '',
          onload: null,
          onerror: null,
          remove: jest.fn(),
          setAttribute: jest.fn(),
          getAttribute: jest.fn(() => null)
        };
        scriptElements.push(el);
        return el;
      }),
      head: {
        appendChild: jest.fn((el) => {
          // Simulate script loading
          if (el.onload) ctx.setTimeout(() => el.onload(), 0);
        })
      },
      documentElement: {
        getAttribute: jest.fn(() => (options.monacoReady ? '1' : null)),
        setAttribute: jest.fn()
      },
      addEventListener: jest.fn((type, handler) => {
        eventTarget.addEventListener(type, handler);
      }),
      removeEventListener: jest.fn((type, handler) => {
        eventTarget.removeEventListener(type, handler);
      }),
      dispatchEvent: jest.fn((event) => {
        eventTarget.dispatchEvent(event);
      })
    };

    ctx.MutationObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }));
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.setInterval = setInterval;
    ctx.clearInterval = clearInterval;

    ctx.__scriptElements = scriptElements;
    return ctx;
  }

  function loadContentScript(context) {
    const filePath = path.resolve(__dirname, '..', 'extension', 'content-script.js');
    const code = fs.readFileSync(filePath, 'utf8');
    const sandbox = vm.createContext(context);
    vm.runInContext(code, sandbox, { filename: 'content-script.js' });
    return context;
  }

  test('sets __apexAutocompleteInjected guard', () => {
    const ctx = buildContext();
    loadContentScript(ctx);
    expect(ctx.__apexAutocompleteInjected).toBe(true);
  });

  test('exposes isLikelyApexPage helper and detects builder URL', () => {
    const ctx = buildContext();
    loadContentScript(ctx);
    expect(typeof ctx.__isLikelyApexPage).toBe('function');
    expect(ctx.__isLikelyApexPage()).toBe(true);
  });

  test('detects classic APEX builder f?p=4000 URLs', () => {
    const ctx = buildContext({ href: 'https://example.com/ords/f?p=4000:4500:123456' });
    loadContentScript(ctx);
    expect(ctx.__isLikelyApexPage()).toBe(true);
  });

  test('does not double-inject if guard is already set', () => {
    const ctx = buildContext();
    ctx.__apexAutocompleteInjected = true;
    loadContentScript(ctx);
    // chrome.runtime.onMessage.addListener should NOT have been called
    expect(chrome.runtime.onMessage.addListener).not.toHaveBeenCalled();
  });

  test('registers a message listener for popup bridge', () => {
    const ctx = buildContext();
    loadContentScript(ctx);
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
  });

  test('does not initialize on non-APEX URLs', () => {
    const ctx = buildContext({ href: 'https://example.com/docs/editor' });
    loadContentScript(ctx);

    expect(ctx.__isLikelyApexPage()).toBe(false);
    expect(chrome.runtime.onMessage.addListener).not.toHaveBeenCalled();
    expect(ctx.document.createElement).not.toHaveBeenCalled();
    expect(ctx.MutationObserver).not.toHaveBeenCalled();
  });

  test('message listener handles GET_EDITORS', () => {
    const ctx = buildContext();
    loadContentScript(ctx);

    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn();

    // It should return true (async response) for GET_EDITORS
    const result = listener({ type: 'GET_EDITORS' }, {}, sendResponse);
    expect(result).toBe(true);

    // It should have added a listener for __apexEditorsResult
    expect(ctx.document.addEventListener).toHaveBeenCalledWith(
      '__apexEditorsResult',
      expect.any(Function)
    );

    // And dispatched __apexGetEditors
    expect(ctx.document.dispatchEvent).toHaveBeenCalled();
  });

  test('message listener handles SET_LANGUAGE', () => {
    const ctx = buildContext();
    loadContentScript(ctx);

    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn();

    listener(
      { type: 'SET_LANGUAGE', editorIndex: 0, languageId: 'plsql' },
      {},
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(ctx.document.dispatchEvent).toHaveBeenCalled();
  });

  test('message listener handles SET_COMPLETION_CASE', () => {
    const ctx = buildContext();
    loadContentScript(ctx);

    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn();

    listener(
      { type: 'SET_COMPLETION_CASE', completionCase: 'lower' },
      {},
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    const caseEvent = ctx.document.dispatchEvent.mock.calls.find(
      (call) => call[0] && call[0].type === '__apexSetCompletionCase'
    );
    expect(caseEvent).toBeDefined();
  });

  test('injects Monaco poller script', () => {
    const ctx = buildContext();
    loadContentScript(ctx);

    // Should have called createElement('script') for the poller
    expect(ctx.document.createElement).toHaveBeenCalledWith('script');

    // Check that one of the scripts is the monaco-poller
    const pollerScript = ctx.__scriptElements.find(
      el => el.src && el.src.includes('monaco-poller.js')
    );
    expect(pollerScript).toBeDefined();
  });

  test('uses chrome.runtime.getURL for script paths', () => {
    const ctx = buildContext();
    loadContentScript(ctx);

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('monaco-poller.js');
  });

  test('starts MutationObserver for Monaco detection', () => {
    const ctx = buildContext();
    loadContentScript(ctx);

    expect(ctx.MutationObserver).toHaveBeenCalled();
  });

  test('loads stored completion case during injection bootstrap', async () => {
    const ctx = buildContext({ monacoReady: true, completionCase: 'lower' });
    loadContentScript(ctx);

    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    expect(chrome.storage.sync.get).toHaveBeenCalledWith(
      { completionCase: 'upper' },
      expect.any(Function)
    );
  });
});
