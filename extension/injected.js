/**
 * injected.js
 * Runs in the PAGE context (MAIN world).
 * Has direct access to window.monaco.
 * Registers the completion provider and configures editors.
 */

(function () {
  'use strict';

  if (window.__apexAutocompleteActive) return;
  window.__apexAutocompleteActive = true;

  var LOG = '[APEX Autocomplete]';
  var configuredEditors = new WeakSet();
  var disposables = [];
  var hasLoggedMonacoWait = false;
  var TARGET_LANGUAGES = ['plsql', 'sql', 'oracle', 'oraclesql', 'plaintext'];

  function normalizeCompletionCase(value) {
    return value === 'lower' ? 'lower' : 'upper';
  }

  if (!window.__apexAutocompleteSettings) {
    window.__apexAutocompleteSettings = {};
  }
  window.__apexAutocompleteSettings.completionCase = normalizeCompletionCase(
    window.__apexAutocompleteSettings.completionCase
  );

  // ── Language detection ───────────────────────

  function isPlsqlEditor(editor) {
    var model = editor.getModel();
    if (!model) return true; // assume PL/SQL if no model

    // Check Monaco language ID
    var langId = '';
    if (typeof model.getLanguageId === 'function') {
      langId = model.getLanguageId();
    } else if (model.getLanguageIdentifier) {
      // Older Monaco API
      langId = model.getLanguageIdentifier().language || '';
    }

    if (langId) {
      var l = langId.toLowerCase();
      if (l === 'javascript' || l === 'typescript' || l === 'css' ||
          l === 'html' || l === 'json') {
        return false;
      }
      if (l.indexOf('sql') !== -1 || l.indexOf('plsql') !== -1 ||
          l === 'oracle' || l === 'plaintext') {
        return true;
      }
    }

    // Fallback: content sniffing
    var content = model.getValue();
    if (content.length > 2000) content = content.substring(0, 2000);
    content = content.toUpperCase();

    if (content.indexOf('FUNCTION') !== -1 && content.indexOf('{') !== -1) {
      return false; // likely JavaScript
    }
    return true; // default to PL/SQL
  }

  // ── Get all registered languages ─────────────

  function getRegisteredLanguages() {
    try {
      return monaco.languages.getLanguages().map(function (l) { return l.id; });
    } catch (e) {
      return [];
    }
  }

  function getSupportedTargetLanguages() {
    var registered = getRegisteredLanguages();
    return TARGET_LANGUAGES.filter(function (lang) {
      return lang === 'plaintext' || registered.indexOf(lang) !== -1;
    });
  }

  function registerLanguageConfiguration() {
    if (!window.monaco || !window.monaco.languages ||
        typeof window.monaco.languages.setLanguageConfiguration !== 'function') {
      return;
    }

    var config = {
      brackets: [['(', ')']],
      autoClosingPairs: [
        { open: '(', close: ')' },
        { open: "'", close: "'", notIn: ['string', 'comment'] },
        { open: '"', close: '"', notIn: ['string', 'comment'] }
      ],
      surroundingPairs: [
        { open: '(', close: ')' },
        { open: "'", close: "'" },
        { open: '"', close: '"' }
      ]
    };

    getSupportedTargetLanguages().forEach(function (lang) {
      try {
        var disposable = monaco.languages.setLanguageConfiguration(lang, config);
        if (disposable) disposables.push(disposable);
      } catch (e) {}
    });
  }

  // ── Register completion provider ─────────────

  function registerProvider() {
    if (!window.monaco || !window.monaco.languages) {
      return false;
    }
    if (!window.__createCompletionProvider) {
      return false;
    }

    var provider = window.__createCompletionProvider(window.monaco);
    var signatureProvider = window.__createSignatureHelpProvider
      ? window.__createSignatureHelpProvider(window.monaco)
      : null;

    // Wrap provider to filter out non-PL/SQL editors
    var filteredProvider = {
      triggerCharacters: provider.triggerCharacters,
      provideCompletionItems: function (model, position, context, token) {
        // Find the editor for this model and check language
        var editors = getEditors();
        for (var i = 0; i < editors.length; i++) {
          if (editors[i].getModel() === model) {
            if (!isPlsqlEditor(editors[i])) {
              return { suggestions: [] };
            }
            break;
          }
        }
        return provider.provideCompletionItems(model, position, context, token);
      }
    };

    var filteredSignatureProvider = signatureProvider ? {
      signatureHelpTriggerCharacters: signatureProvider.signatureHelpTriggerCharacters,
      signatureHelpRetriggerCharacters: signatureProvider.signatureHelpRetriggerCharacters,
      provideSignatureHelp: function (model, position, token, context) {
        var editors = getEditors();
        for (var i = 0; i < editors.length; i++) {
          if (editors[i].getModel() === model) {
            if (!isPlsqlEditor(editors[i])) {
              return null;
            }
            break;
          }
        }
        return signatureProvider.provideSignatureHelp(model, position, token, context);
      }
    } : null;

    // Register for known language IDs
    var targets = getSupportedTargetLanguages();
    var count = 0;

    targets.forEach(function (lang) {
      try {
        var d = monaco.languages.registerCompletionItemProvider(lang, filteredProvider);
        disposables.push(d);
        if (filteredSignatureProvider && monaco.languages.registerSignatureHelpProvider) {
          var sigDisposable = monaco.languages.registerSignatureHelpProvider(lang, filteredSignatureProvider);
          disposables.push(sigDisposable);
        }
        count++;
        // console.log(LOG, 'Registered for "' + lang + '"');
      } catch (e) {}
    });

    // If none of the SQL languages were found, register on plaintext
    // which is the fallback APEX sometimes uses
    if (count === 0) {
      try {
        var d = monaco.languages.registerCompletionItemProvider('plaintext', filteredProvider);
        disposables.push(d);
        if (filteredSignatureProvider && monaco.languages.registerSignatureHelpProvider) {
          var sigDisposable = monaco.languages.registerSignatureHelpProvider('plaintext', filteredSignatureProvider);
          disposables.push(sigDisposable);
        }
        // console.log(LOG, 'Registered for "plaintext" (fallback)');
        count++;
      } catch (e) {
        console.error(LOG, 'Could not register any provider:', e.message);
      }
    }

    return count > 0;
  }

  // ── Find editors ─────────────────────────────

  function getEditors() {
    if (!window.monaco || !window.monaco.editor) return [];

    // Monaco >= 0.21
    if (typeof monaco.editor.getEditors === 'function') {
      return monaco.editor.getEditors();
    }

    // Fallback: walk DOM
    var results = [];
    var nodes = document.querySelectorAll('.monaco-editor');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // APEX wraps editors; look for _editor on various ancestors
      var parent = el.closest('.a-MonacoEditor') ||
                   el.closest('.apex-item-code-editor') ||
                   el.closest('[data-item-id]') ||
                   el.parentElement;
      if (parent) {
        // Try common APEX storage patterns
        var ed = parent._editor || parent.__monacoEditor;
        if (ed) { results.push(ed); continue; }

        // Also try to get it from the widget node
        if (el._modelData && el._modelData.editor) {
          results.push(el._modelData.editor);
        }
      }
    }
    return results;
  }

  // ── Configure editor for autocomplete UX ─────

  function configureEditor(editor) {
    if (configuredEditors.has(editor)) return;
    configuredEditors.add(editor);

    if (!isPlsqlEditor(editor)) {
      // console.log(LOG, 'Skipping non-PL/SQL editor');
      return;
    }

    try {
      editor.updateOptions({
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: true,
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoSurround: 'languageDefined',
        matchBrackets: 'always',
        // Keep suggest/parameter widgets anchored to the editor viewport.
        // This avoids offset tooltips in APEX layouts that use transformed
        // containers (dialogs, split panes, sticky regions).
        fixedOverflowWidgets: true,
        suggest: {
          showKeywords: true,
          showSnippets: true,
          showFunctions: true,
          showVariables: true,
          showMethods: true,
          filterGraceful: true,
          snippetsPreventQuickSuggestions: false
        },
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on'
      });
      // console.log(LOG, 'Configured editor');
    } catch (e) {
      // Ignore editor option update failures.
    }
  }

  // ── Init ─────────────────────────────────────

  function init() {
    if (!window.monaco) {
      hasLoggedMonacoWait = true;
      setTimeout(init, 1000);
      return;
    }
    hasLoggedMonacoWait = false;

    // 1. Register completion provider
    var ok = registerProvider();
    if (!ok) {
      console.error(LOG, 'Failed to register any completion provider');
      return;
    }
    registerLanguageConfiguration();

    // 2. Configure existing editors
    var editors = getEditors();
    editors.forEach(configureEditor);
    // console.log(LOG, 'Configured', editors.length, 'existing editor(s)');

    // 3. Watch for new editors
    if (typeof monaco.editor.onDidCreateEditor === 'function') {
      monaco.editor.onDidCreateEditor(function (editor) {
        // console.log(LOG, 'New editor detected');
        setTimeout(function () { configureEditor(editor); }, 200);
      });
    }

    // 4. DOM observer for dynamically added editors (APEX navigation)
    var observer = new MutationObserver(function (mutations) {
      var found = false;
      for (var i = 0; i < mutations.length && !found; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType === 1 &&
              (node.classList && node.classList.contains('monaco-editor') ||
               node.querySelector && node.querySelector('.monaco-editor'))) {
            found = true;
            break;
          }
        }
      }
      if (found) {
        setTimeout(function () {
          getEditors().forEach(configureEditor);
        }, 500);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // console.log(LOG, '✓ Active — SQL / PL/SQL / APEX API autocomplete enabled');
  }

  document.addEventListener('__apexSetCompletionCase', function (e) {
    var data = {};
    try {
      data = typeof e.detail === 'string' ? JSON.parse(e.detail) : (e.detail || {});
    } catch (err) {}

    if (data && Object.prototype.hasOwnProperty.call(data, 'completionCase')) {
      window.__apexAutocompleteSettings.completionCase = normalizeCompletionCase(data.completionCase);
    }
  });

  init();
})();
