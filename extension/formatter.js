/**
 * formatter.js
 * Runs in the PAGE context (MAIN world).
 * Provides SQL/PL/SQL formatting for Monaco editors in Oracle APEX.
 *
 * Hybrid approach:
 * - Uses sql-formatter (loaded externally) for pure SQL statements
 * - Uses custom PL/SQL indenter for procedural blocks
 * - Auto-detects which formatter to use based on code content
 *
 * Registers a DocumentFormattingEditProvider so Shift+Alt+F works natively.
 */

(function () {
  'use strict';

  if (window.__apexFormatterActive) return;
  window.__apexFormatterActive = true;

  var LOG = '[APEX Formatter]';
  var hasLoggedMonacoWait = false;

  // ── SQL vs PL/SQL detection ──────────────────

  /**
   * Detect whether code is procedural PL/SQL or pure SQL.
   * Returns 'plsql' if procedural blocks are found, 'sql' otherwise.
   */
  function detectLanguageType(code) {
    if (!code || !code.trim()) return 'sql';

    // Strip strings and comments for accurate detection
    var clean = stripForDetection(code);
    var upper = clean.toUpperCase();

    // Procedural PL/SQL indicators
    var plsqlPatterns = [
      /\bDECLARE\b/,
      /\bBEGIN\b/,
      /\bEXCEPTION\b/,
      /\bCREATE\s+(OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION|PACKAGE(\s+BODY)?|TRIGGER|TYPE(\s+BODY)?)\b/,
      /\bEND\s*;/,
      /\bEND\s+IF\s*;/,
      /\bEND\s+LOOP\s*;/,
      /\bEND\s+CASE\s*;/,
      /\bFOR\s+\w+\s+IN\b/,
      /\bWHILE\s+.*\bLOOP\b/,
      /\bIF\b.*\bTHEN\b/,
      /\bELSIF\b/,
      /\bRAISE\b/,
      /\bPRAGMA\b/,
      /\bCURSOR\s+\w+\s+IS\b/,
      /\bOPEN\s+\w+/,
      /\bFETCH\s+\w+/,
      /\bDBMS_OUTPUT\b/,
      /\bEXECUTE\s+IMMEDIATE\b/
    ];

    for (var i = 0; i < plsqlPatterns.length; i++) {
      if (plsqlPatterns[i].test(upper)) {
        return 'plsql';
      }
    }

    return 'sql';
  }

  /**
   * Strip strings and comments for language detection.
   * Simpler version than the full tokenizer.
   */
  function stripForDetection(code) {
    // Remove block comments
    var result = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
    // Remove line comments
    result = result.replace(/--[^\n]*/g, ' ');
    // Remove quoted strings (handle escaped quotes)
    result = result.replace(/'(?:[^']|'')*'/g, "' '");
    // Remove q-quoted strings
    result = result.replace(/[qQ]'\[[\s\S]*?\]'/g, "' '");
    result = result.replace(/[qQ]'\{[\s\S]*?\}'/g, "' '");
    result = result.replace(/[qQ]'<[\s\S]*?>'/g, "' '");
    result = result.replace(/[qQ]'\([\s\S]*?\)'/g, "' '");
    return result;
  }

  // ── SQL Formatter wrapper ────────────────────

  /**
   * Format pure SQL using sql-formatter library.
   * Falls back to basic formatting if library not loaded.
   */
  function formatSql(code, options) {
    options = options || {};
    var tabSize = options.tabSize || 2;
    var upperCase = options.upperCaseKeywords !== false;

    // Use sql-formatter if available
    if (window.sqlFormatter && typeof window.sqlFormatter.format === 'function') {
      try {
        return window.sqlFormatter.format(code, {
          language: 'plsql',
          tabWidth: tabSize,
          keywordCase: upperCase ? 'upper' : 'preserve',
          linesBetweenQueries: 1
        });
      } catch (e) {
        return formatSqlFallback(code, tabSize, upperCase);
      }
    }

    // Fallback: basic SQL formatting
    return formatSqlFallback(code, tabSize, upperCase);
  }

  /**
   * Basic SQL formatter fallback when sql-formatter library is not available.
   * Handles common SQL clauses with simple line breaks and indentation.
   */
  function formatSqlFallback(code, tabSize, upperCase) {
    if (!code || !code.trim()) return code || '';

    var indent = '';
    for (var s = 0; s < tabSize; s++) indent += ' ';

    // Normalize whitespace
    var normalized = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Strip comments and strings for safe keyword detection
    var stripped = stripForDetection(normalized);

    // Simple approach: ensure major clauses start on new lines
    var majorClauses = [
      'SELECT', 'FROM', 'WHERE', 'GROUP\\s+BY', 'ORDER\\s+BY', 'HAVING',
      'INNER\\s+JOIN', 'LEFT\\s+OUTER\\s+JOIN', 'LEFT\\s+JOIN',
      'RIGHT\\s+OUTER\\s+JOIN', 'RIGHT\\s+JOIN',
      'FULL\\s+OUTER\\s+JOIN', 'FULL\\s+JOIN', 'CROSS\\s+JOIN',
      'JOIN', 'ON', 'AND', 'OR',
      'INSERT\\s+INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE\\s+FROM',
      'MERGE\\s+INTO', 'USING', 'WHEN\\s+MATCHED', 'WHEN\\s+NOT\\s+MATCHED',
      'UNION\\s+ALL', 'UNION', 'INTERSECT', 'MINUS',
      'CREATE\\s+TABLE', 'ALTER\\s+TABLE', 'DROP\\s+TABLE',
      'WITH'
    ];

    var result = normalized.trim();

    // Add line breaks before major clauses (but not inside strings/comments)
    for (var c = 0; c < majorClauses.length; c++) {
      var clause = majorClauses[c];
      var re = new RegExp('(?<!\\n)\\s+(' + clause + ')\\b', 'gi');
      result = result.replace(re, '\n$1');
    }

    // Indent lines after SELECT, FROM, etc.
    var lines = result.split('\n');
    var formatted = [];
    var level = 0;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var upper = line.toUpperCase();

      // Determine indent level
      if (/^(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|WITH|CREATE\s+TABLE)\b/i.test(line)) {
        level = 0;
      } else if (/^(FROM|WHERE|SET|VALUES|USING|GROUP\s+BY|ORDER\s+BY|HAVING)\b/i.test(line)) {
        level = 0;
      } else if (/^(AND|OR)\b/i.test(line)) {
        level = 1;
      } else if (/^(INNER\s+JOIN|LEFT|RIGHT|FULL|CROSS|JOIN|ON)\b/i.test(line)) {
        level = 1;
      } else if (/^(WHEN\s+(NOT\s+)?MATCHED|UNION|INTERSECT|MINUS)\b/i.test(line)) {
        level = 0;
      } else {
        level = 1;
      }

      var indentStr = '';
      for (var il = 0; il < level; il++) indentStr += indent;

      if (upperCase) {
        line = uppercaseSqlKeywords(line);
      }

      formatted.push(indentStr + line);
    }

    return formatted.join('\n') + (formatted.length > 0 ? '\n' : '');
  }

  /**
   * Uppercase common SQL keywords.
   */
  function uppercaseSqlKeywords(line) {
    var keywords = [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
      'BETWEEN', 'LIKE', 'IS', 'NULL', 'AS', 'ON', 'JOIN', 'INNER',
      'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'GROUP', 'BY',
      'ORDER', 'ASC', 'DESC', 'HAVING', 'UNION', 'ALL', 'INTERSECT',
      'MINUS', 'DISTINCT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
      'DELETE', 'MERGE', 'USING', 'WHEN', 'MATCHED', 'THEN',
      'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW',
      'WITH', 'CASE', 'ELSE', 'END', 'LIMIT', 'OFFSET', 'FETCH',
      'FIRST', 'NEXT', 'ROWS', 'ONLY', 'RETURNING'
    ];
    var result = line;
    for (var k = 0; k < keywords.length; k++) {
      var re = new RegExp('\\b' + keywords[k] + '\\b', 'gi');
      result = result.replace(re, keywords[k]);
    }
    return result;
  }

  // ── Main format function ─────────────────────

  /**
   * Format SQL or PL/SQL code using the hybrid approach.
   * @param {string} code - The code to format.
   * @param {object} [options] - Formatting options.
   * @param {number} [options.tabSize=2] - Spaces per indent level.
   * @param {boolean} [options.upperCaseKeywords=true] - Uppercase keywords.
   * @returns {string} Formatted code.
   */
  function formatCode(code, options) {
    if (!code || !code.trim()) return code || '';

    var lang = detectLanguageType(code);

    if (lang === 'plsql') {
      // Use custom PL/SQL indenter
      if (typeof window.__formatPlsql === 'function') {
        var result = window.__formatPlsql(code, options);
        return result;
      }
      // Fallback if indenter not loaded
      return formatSql(code, options);
    }

    return formatSql(code, options);
  }

  // ── Monaco integration ───────────────────────

  /**
   * Register DocumentFormattingEditProvider for Monaco.
   * This enables Shift+Alt+F formatting.
   */
  function registerFormattingProvider() {
    if (!window.monaco || !window.monaco.languages) {
      return false;
    }

    var provider = {
      provideDocumentFormattingEdits: function (model, options) {
        var code = model.getValue();
        var tabSize = (options && options.tabSize) || 2;

        var formatted = formatCode(code, {
          tabSize: tabSize,
          upperCaseKeywords: true
        });

        // Return a single edit that replaces the entire document
        var lineCount = model.getLineCount();
        var lastLineLength = model.getLineMaxColumn(lineCount);

        return [{
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: lineCount,
            endColumn: lastLineLength
          },
          text: formatted
        }];
      }
    };

    // Register for all SQL-like languages
    var targets = ['plsql', 'sql', 'oracle', 'oraclesql', 'plaintext'];
    var registered = [];
    try {
      var langs = monaco.languages.getLanguages().map(function (l) { return l.id; });
      targets.forEach(function (lang) {
        if (lang === 'plaintext' || langs.indexOf(lang) !== -1) {
          try {
            monaco.languages.registerDocumentFormattingEditProvider(lang, provider);
            registered.push(lang);
          } catch (e) {
          }
        }
      });
    } catch (e) {
      console.error(LOG, 'Failed to register formatting provider:', e.message);
    }

    return registered.length > 0;
  }

  // ── Add format button to APEX toolbar ────────

  function addFormatButton() {
    // Look for the APEX code editor toolbar
    var toolbars = document.querySelectorAll('.a-Toolbar, .a-CodeEditor-toolbar');
    if (toolbars.length === 0) return;

    toolbars.forEach(function (toolbar) {
      // Don't add button twice
      if (toolbar.querySelector('.apex-format-btn')) return;

      var btn = document.createElement('button');
      btn.className = 'a-Button a-Button--noLabel a-Button--withIcon apex-format-btn';
      btn.title = 'Format SQL/PL/SQL (Shift+Alt+F)';
      btn.type = 'button';
      btn.innerHTML = '<span class="a-Icon fa fa-code" aria-hidden="true"></span>';
      btn.style.cssText = 'margin-left:4px;';

      btn.addEventListener('click', function () {
        // Find the active/focused editor and trigger formatting
        var editors = getActiveEditors();
        if (editors.length > 0) {
          var editor = editors[0];
          // Trigger the built-in format action
          editor.getAction('editor.action.formatDocument').run();
        }
      });

      toolbar.appendChild(btn);
    });
  }

  /**
   * Get Monaco editors on the page.
   */
  function getActiveEditors() {
    if (!window.monaco || !window.monaco.editor) return [];
    if (typeof monaco.editor.getEditors === 'function') {
      return monaco.editor.getEditors();
    }
    return [];
  }

  // ── Init ─────────────────────────────────────

  function init() {
    if (!window.monaco) {
      hasLoggedMonacoWait = true;
      setTimeout(init, 1000);
      return;
    }

    hasLoggedMonacoWait = false;
    // console.log(LOG, '🏁 Initializing formatter…');
    // console.log(LOG, '  window.__formatPlsql =', typeof window.__formatPlsql);
    // console.log(LOG, '  window.sqlFormatter =', typeof window.sqlFormatter);
    // console.log(LOG, '  window.monaco =', typeof window.monaco);

    // Register formatting provider
    var ok = registerFormattingProvider();
    if (!ok) {
      console.error(LOG, 'Formatting provider was not registered');
    }

    // Try to add format button to toolbar
    try {
      addFormatButton();
      // Also watch for toolbar being added later
      var observer = new MutationObserver(function () {
        addFormatButton();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
    }

    // console.log(LOG, 'Formatter active');
  }

  // Expose functions globally for testing and direct use
  window.__formatCode = formatCode;
  window.__formatSql = formatSql;
  window.__detectLanguageType = detectLanguageType;

  init();
})();
