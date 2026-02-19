/**
 * Tests for monaco-poller.js
 * Validates polling behavior for Monaco detection.
 */

describe('monaco-poller', () => {
  let intervalCallbacks;
  let clearedIntervals;
  let ctx;

  beforeEach(() => {
    intervalCallbacks = [];
    clearedIntervals = [];

    ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = {
      documentElement: {
        setAttribute: jest.fn()
      }
    };
    ctx.setInterval = jest.fn((fn, ms) => {
      const id = intervalCallbacks.length;
      intervalCallbacks.push({ fn, ms });
      return id;
    });
    ctx.clearInterval = jest.fn((id) => {
      clearedIntervals.push(id);
    });
  });

  function loadPoller() {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');
    const code = fs.readFileSync(path.resolve(__dirname, '..', 'monaco-poller.js'), 'utf8');
    const sandbox = vm.createContext(ctx);
    vm.runInContext(code, sandbox, { filename: 'monaco-poller.js' });
  }

  test('starts a polling interval at 500ms', () => {
    loadPoller();
    expect(ctx.setInterval).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  test('sets data-apex-monaco-ready=1 when monaco is found', () => {
    loadPoller();
    const pollFn = intervalCallbacks[0].fn;

    // Simulate Monaco becoming available
    ctx.monaco = { editor: {} };

    pollFn();

    expect(ctx.document.documentElement.setAttribute).toHaveBeenCalledWith(
      'data-apex-monaco-ready', '1'
    );
    expect(ctx.clearInterval).toHaveBeenCalled();
  });

  test('sets data-apex-monaco-ready=timeout after 120 attempts', () => {
    loadPoller();
    const pollFn = intervalCallbacks[0].fn;

    // Run 120 attempts without monaco
    for (let i = 0; i < 120; i++) {
      pollFn();
    }

    // Should NOT have timed out yet (> 120)
    expect(ctx.document.documentElement.setAttribute).not.toHaveBeenCalled();

    // 121st attempt triggers timeout
    pollFn();
    expect(ctx.document.documentElement.setAttribute).toHaveBeenCalledWith(
      'data-apex-monaco-ready', 'timeout'
    );
    expect(ctx.clearInterval).toHaveBeenCalled();
  });

  test('does not set attribute on attempts below threshold', () => {
    loadPoller();
    const pollFn = intervalCallbacks[0].fn;

    // Run a few attempts
    pollFn();
    pollFn();
    pollFn();

    expect(ctx.document.documentElement.setAttribute).not.toHaveBeenCalled();
  });
});
