/**
 * Tests for popup.js
 * Validates popup UI logic: editor rendering, language switching, helpers.
 *
 * popup.js uses DOM elements and chrome APIs. We test via jsdom + mocks.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createMockChrome } = require('./helpers');

describe('popup.js', () => {
  let chrome;

  beforeEach(() => {
    // Set up the DOM that popup.html would provide
    document.body.innerHTML = `
      <div id="status"></div>
      <div id="editors-list"></div>
      <div id="no-editors" style="display: none;">No editors found</div>
    `;
    chrome = createMockChrome();
  });

  function loadPopup(tabResponse) {
    // Mock chrome.tabs.query to return a tab, then sendMessage to return editors
    chrome.tabs.query.mockImplementation((query, cb) => {
      cb([{ id: 1 }]);
    });
    chrome.tabs.sendMessage.mockImplementation((tabId, msg, cb) => {
      if (cb && msg.type === 'GET_EDITORS') {
        cb(tabResponse || { editors: [] });
      }
    });

    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.chrome = chrome;
    ctx.document = document;
    ctx.setTimeout = jest.fn((fn, ms) => fn());
    ctx.requestAnimationFrame = jest.fn((fn) => fn());
    ctx.parseInt = parseInt;
    ctx.Object = Object;
    ctx.Array = Array;
    ctx.JSON = JSON;

    const code = fs.readFileSync(path.resolve(__dirname, '..', 'popup.js'), 'utf8');
    const sandbox = vm.createContext(ctx);
    vm.runInContext(code, sandbox, { filename: 'popup.js' });
    return ctx;
  }

  test('shows "no editors" when no editors returned', () => {
    loadPopup({ editors: [] });
    const noEditors = document.getElementById('no-editors');
    expect(noEditors.style.display).toBe('block');
  });

  test('shows "no editors" when response is null', () => {
    chrome.tabs.query.mockImplementation((q, cb) => cb([{ id: 1 }]));
    chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (cb) cb(null);
    });
    chrome.runtime.lastError = new Error('No content script');

    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.chrome = chrome;
    ctx.document = document;
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.requestAnimationFrame = jest.fn((fn) => fn());
    ctx.parseInt = parseInt;
    ctx.Object = Object;
    ctx.Array = Array;
    ctx.JSON = JSON;

    const code = fs.readFileSync(path.resolve(__dirname, '..', 'popup.js'), 'utf8');
    vm.runInContext(code, vm.createContext(ctx), { filename: 'popup.js' });

    const noEditors = document.getElementById('no-editors');
    expect(noEditors.style.display).toBe('block');
  });

  test('renders editor cards when editors are found', () => {
    loadPopup({
      editors: [
        { index: 0, language: 'plsql', hint: 'P1_CODE' },
        { index: 1, language: 'javascript', hint: '' }
      ]
    });

    const list = document.getElementById('editors-list');
    const cards = list.querySelectorAll('.editor-card');
    expect(cards.length).toBe(2);
  });

  test('shows correct status text for editors', () => {
    loadPopup({
      editors: [
        { index: 0, language: 'plsql', hint: '' }
      ]
    });

    const status = document.getElementById('status');
    expect(status.textContent).toBe('1 editor detected');
  });

  test('shows plural status for multiple editors', () => {
    loadPopup({
      editors: [
        { index: 0, language: 'plsql', hint: '' },
        { index: 1, language: 'sql', hint: '' }
      ]
    });

    const status = document.getElementById('status');
    expect(status.textContent).toBe('2 editors detected');
  });

  test('editor card has a language select with correct options', () => {
    loadPopup({
      editors: [
        { index: 0, language: 'plsql', hint: '' }
      ]
    });

    const select = document.querySelector('select');
    expect(select).not.toBeNull();
    const optionValues = Array.from(select.options).map(o => o.value);
    expect(optionValues).toContain('plsql');
    expect(optionValues).toContain('javascript');
    expect(optionValues).toContain('sql');
    expect(optionValues).toContain('html');
    expect(optionValues).toContain('css');
    expect(optionValues).toContain('json');
  });

  test('selecting a language sends SET_LANGUAGE message', () => {
    loadPopup({
      editors: [
        { index: 0, language: 'plsql', hint: '' }
      ]
    });

    const select = document.querySelector('select');
    select.value = 'javascript';
    select.dispatchEvent(new Event('change'));

    // chrome.tabs.sendMessage should have been called for SET_LANGUAGE
    const setLangCall = chrome.tabs.sendMessage.mock.calls.find(
      call => call[1] && call[1].type === 'SET_LANGUAGE'
    );
    expect(setLangCall).toBeDefined();
    expect(setLangCall[1].languageId).toBe('javascript');
    expect(setLangCall[1].editorIndex).toBe(0);
  });

  test('editor card shows language badge', () => {
    loadPopup({
      editors: [
        { index: 0, language: 'plsql', hint: '' }
      ]
    });

    const badge = document.querySelector('.badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('plsql');
    expect(badge.classList.contains('plsql')).toBe(true);
  });

  test('editor card shows hint when provided', () => {
    loadPopup({
      editors: [
        { index: 0, language: 'plsql', hint: 'P1_CODE_EDITOR' }
      ]
    });

    const card = document.querySelector('.editor-card');
    expect(card.innerHTML).toContain('P1_CODE_EDITOR');
  });

  test('handles tab with no id gracefully', () => {
    chrome.tabs.query.mockImplementation((q, cb) => cb([]));

    const ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.chrome = chrome;
    ctx.document = document;
    ctx.setTimeout = jest.fn((fn) => fn());
    ctx.requestAnimationFrame = jest.fn((fn) => fn());
    ctx.parseInt = parseInt;
    ctx.Object = Object;
    ctx.Array = Array;
    ctx.JSON = JSON;

    const code = fs.readFileSync(path.resolve(__dirname, '..', 'popup.js'), 'utf8');
    vm.runInContext(code, vm.createContext(ctx), { filename: 'popup.js' });

    const noEditors = document.getElementById('no-editors');
    expect(noEditors.style.display).toBe('block');
  });
});
