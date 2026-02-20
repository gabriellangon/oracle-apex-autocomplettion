/**
 * content-script.js
 * Injected into APEX pages by Chrome extension.
 * Injects dictionaries + scripts into the PAGE context (MAIN world)
 * so they can access window.monaco.
 *
 * All injections use external script files (no inline scripts)
 * to comply with Content Security Policy.
 *
 * Also acts as a message bridge between the popup and page-context scripts.
 */

(function () {
  'use strict';

  if (window.__apexAutocompleteInjected) return;
  window.__apexAutocompleteInjected = true;

  console.log('[APEX Autocomplete] Content script loaded on', location.href);

  // ── helpers ──────────────────────────────────

  function injectScript(file) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = chrome.runtime.getURL(file);
      s.onload = function () { s.remove(); resolve(); };
      s.onerror = function (e) { s.remove(); reject(e); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  /**
   * Load a JSON dictionary and send it to the page context
   * via a CustomEvent (CSP-safe, no inline scripts).
   * dict-loader.js must be injected first to listen for these events.
   */
  function injectDictionary(file, globalName) {
    return fetch(chrome.runtime.getURL(file))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        document.dispatchEvent(new CustomEvent('__apexDict', {
          detail: { name: globalName, data: data }
        }));
      });
  }

  // ── injection sequence ───────────────────────

  async function injectAll() {
    try {
      // Step 1: Inject the dictionary loader (listens for CustomEvents)
      await injectScript('dict-loader.js');

      // Step 2: Send dictionaries via events
      await Promise.all([
        injectDictionary('dictionaries/sql-keywords.json', '__sqlKeywords'),
        injectDictionary('dictionaries/plsql-keywords.json', '__plsqlKeywords'),
        injectDictionary('dictionaries/apex-api.json', '__apexApi'),
      ]);

      // Step 3: Inject parser, completion provider, main hook
      await injectScript('parsers/variable-parser.js');
      await injectScript('completion-provider.js');
      await injectScript('injected.js');

      // Step 4: Inject language switcher (for popup communication)
      await injectScript('language-switcher.js');

      // Step 5: Inject PL/SQL indenter then formatter (order matters)
      await injectScript('plsql-indenter.js');
      await injectScript('formatter.js');

      console.log('[APEX Autocomplete] All scripts injected');
    } catch (err) {
      console.error('[APEX Autocomplete] Injection failed:', err);
    }
  }

  // ── wait for Monaco (external poller, CSP-safe) ─

  function startMonacoDetection() {
    // Inject the poller as an external script (CSP-safe)
    injectScript('monaco-poller.js').catch(function () {
      console.warn('[APEX Autocomplete] Could not inject Monaco poller');
    });

    // Observe the attribute set by the poller from content-script world
    var obs = new MutationObserver(function () {
      var val = document.documentElement.getAttribute('data-apex-monaco-ready');
      if (val) {
        obs.disconnect();
        if (val === '1') {
          console.log('[APEX Autocomplete] Monaco detected via poller');
        } else {
          console.log('[APEX Autocomplete] Monaco detection timed out – injecting anyway');
        }
        injectAll();
      }
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-apex-monaco-ready']
    });

    // Also check if attribute is already set (race condition)
    var existing = document.documentElement.getAttribute('data-apex-monaco-ready');
    if (existing) {
      obs.disconnect();
      injectAll();
    }
  }

  // ── Message bridge: popup ↔ page context ────

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === 'GET_EDITORS') {
      // Ask the page-context script for editor info
      var handler = function (e) {
        document.removeEventListener('__apexEditorsResult', handler);
        try {
          var editors = JSON.parse(e.detail);
          sendResponse({ editors: editors });
        } catch (err) {
          sendResponse({ editors: [] });
        }
      };
      document.addEventListener('__apexEditorsResult', handler);
      document.dispatchEvent(new CustomEvent('__apexGetEditors'));
      return true; // async response
    }

    if (msg.type === 'SET_LANGUAGE') {
      // Tell the page-context script to switch language
      document.dispatchEvent(new CustomEvent('__apexSetLanguage', {
        detail: JSON.stringify({
          editorIndex: msg.editorIndex,
          languageId: msg.languageId
        })
      }));
      sendResponse({ ok: true });
      return false;
    }
  });

  // ── entry point ──────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMonacoDetection);
  } else {
    startMonacoDetection();
  }
})();
