/**
 * completion-provider.js
 * Core autocomplete logic. Builds Monaco CompletionItemProvider
 * from SQL/PL/SQL keywords, APEX API dictionaries, and live variables.
 *
 * Runs in the PAGE context (has access to window.monaco).
 */

(function () {
  'use strict';

  // ── CompletionItemKind mapping ───────────────

  function getKind(monaco, category) {
    var K = monaco.languages.CompletionItemKind;
    var map = {
      dml: K.Keyword, clause: K.Keyword, join: K.Keyword,
      set: K.Keyword, condition: K.Keyword, expression: K.Keyword,
      alias: K.Keyword, modifier: K.Keyword, logical: K.Keyword,
      ddl: K.Keyword, dcl: K.Keyword, tcl: K.Keyword, dynamic: K.Keyword,
      block: K.Keyword, control: K.Keyword, loop: K.Keyword,
      cursor: K.Keyword, cursor_attr: K.Property, type_attr: K.Property,
      bulk: K.Keyword, type: K.TypeParameter, composite_type: K.Struct,
      exception: K.Event, program_unit: K.Keyword, parameter: K.Keyword,
      builtin_pkg: K.Function, 'function': K.Function, analytic: K.Function,
      apex_proc: K.Method, apex_func: K.Function, apex_pkg: K.Module,
      variable: K.Variable, snippet: K.Snippet
    };
    return map[category] || K.Text;
  }

  // ── Build items from dictionaries ────────────

  function buildKeywordItems(monaco, dict) {
    if (!dict || !dict.keywords) return [];
    return dict.keywords.map(function (kw) {
      return {
        label:      kw.label,
        kind:       getKind(monaco, kw.category),
        detail:     kw.detail || kw.category,
        insertText: kw.label,
        sortText:   '2_' + kw.label,
        filterText: kw.label
      };
    });
  }

  function buildSnippetItems(monaco, dict) {
    if (!dict || !dict.snippets) return [];
    return dict.snippets.map(function (sn) {
      return {
        label:           sn.label,
        kind:            monaco.languages.CompletionItemKind.Snippet,
        detail:          sn.detail || 'Snippet',
        insertText:      sn.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText:        '4_' + sn.label,
        documentation:   sn.detail || ''
      };
    });
  }

  function buildApexItems(monaco, apiDict) {
    if (!apiDict || !apiDict.packages) return [];
    var items = [];
    apiDict.packages.forEach(function (pkg) {
      items.push({
        label:      pkg.name,
        kind:       getKind(monaco, 'apex_pkg'),
        detail:     'APEX Package',
        insertText: pkg.name,
        sortText:   '3_' + pkg.name
      });
      if (!pkg.procedures) return;
      pkg.procedures.forEach(function (proc) {
        var isFunc = proc.signature && proc.signature.indexOf('RETURN') !== -1;
        items.push({
          label:         proc.label,
          kind:          getKind(monaco, isFunc ? 'apex_func' : 'apex_proc'),
          detail:        proc.detail || proc.label,
          insertText:    proc.label,
          documentation: { value: '```\n' + (proc.signature || '') + '\n```' },
          sortText:      '3_' + proc.label
        });
      });
    });
    return items;
  }

  function buildVariableItems(monaco, variables) {
    return variables.map(function (v) {
      return {
        label:      v.name,
        kind:       getKind(monaco, 'variable'),
        detail:     v.type + ' (line ' + v.line + ')',
        insertText: v.name,
        sortText:   '1_' + v.name   // variables first
      };
    });
  }

  // ── Package-dot lookup ───────────────────────

  function buildPackageMap(monaco, apiDict) {
    var map = {};
    if (!apiDict || !apiDict.packages) return map;
    apiDict.packages.forEach(function (pkg) {
      if (!pkg.procedures) return;
      map[pkg.name.toUpperCase()] = pkg.procedures.map(function (proc) {
        var shortName = proc.label.indexOf('.') !== -1
          ? proc.label.split('.').pop()
          : proc.label;
        var isFunc = proc.signature && proc.signature.indexOf('RETURN') !== -1;
        return {
          label:         shortName,
          kind:          isFunc ? monaco.languages.CompletionItemKind.Function
                                : monaco.languages.CompletionItemKind.Method,
          detail:        proc.detail || '',
          insertText:    shortName,
          documentation: { value: '```\n' + (proc.signature || '') + '\n```' },
          sortText:      '1_' + shortName
        };
      });
    });
    return map;
  }

  // ── Detect package prefix before cursor ──────

  function getPackagePrefix(model, position) {
    var line = model.getLineContent(position.lineNumber);
    var before = line.substring(0, position.column - 1);
    // Match "WORD." at the end, including after the user typed the dot
    var m = before.match(/(\w+)\.\w*$/);
    if (m) return m[1].toUpperCase();
    // Also match if cursor is right after the dot: "APEX_JSON.|"
    m = before.match(/(\w+)\.$/);
    if (m) return m[1].toUpperCase();
    return null;
  }

  // ── Range helper ─────────────────────────────

  function getRange(model, position) {
    var info = model.getWordUntilPosition(position);
    return {
      startLineNumber: position.lineNumber,
      endLineNumber:   position.lineNumber,
      startColumn:     info.startColumn,
      endColumn:       position.column
    };
  }

  // ── Create the provider ──────────────────────

  function createCompletionProvider(monaco) {
    var sqlItems    = buildKeywordItems(monaco, window.__sqlKeywords);
    var plsqlItems  = buildKeywordItems(monaco, window.__plsqlKeywords);
    var sqlSnippets = buildSnippetItems(monaco, window.__sqlKeywords);
    var plsqlSnips  = buildSnippetItems(monaco, window.__plsqlKeywords);
    var snippets    = sqlSnippets.concat(plsqlSnips);
    var apexItems   = buildApexItems(monaco, window.__apexApi);
    var staticItems = sqlItems.concat(plsqlItems).concat(snippets).concat(apexItems);
    var packageMap  = buildPackageMap(monaco, window.__apexApi);

    console.log('[APEX Autocomplete] Provider built:',
      sqlItems.length, 'SQL +',
      plsqlItems.length, 'PL/SQL +',
      snippets.length, 'snippets +',
      apexItems.length, 'APEX API =',
      staticItems.length, 'total items');

    return {
      triggerCharacters: ['.'],

      provideCompletionItems: function (model, position) {
        var range = getRange(model, position);
        var pkgPrefix = getPackagePrefix(model, position);

        // After a dot → show only that package's members
        if (pkgPrefix && packageMap[pkgPrefix]) {
          return {
            suggestions: packageMap[pkgPrefix].map(function (item) {
              return Object.assign({}, item, { range: range });
            })
          };
        }

        // General completion: static items + live variables
        var code = model.getValue();
        var vars = (typeof window.__extractVariables === 'function')
          ? window.__extractVariables(code) : [];
        var varItems = buildVariableItems(monaco, vars);

        var all = varItems.concat(staticItems);
        return {
          suggestions: all.map(function (item) {
            return Object.assign({}, item, { range: range });
          })
        };
      }
    };
  }

  // Expose to injected.js
  window.__createCompletionProvider = createCompletionProvider;

  console.log('[APEX Autocomplete] completion-provider.js loaded');
})();
