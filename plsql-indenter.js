/**
 * plsql-indenter.js
 * Rule-based PL/SQL indenter for procedural blocks.
 * Handles DECLARE/BEGIN/END, IF/ELSIF/ELSE, LOOP, CASE,
 * EXCEPTION, CREATE PROCEDURE/FUNCTION/PACKAGE, comments, and strings.
 *
 * Runs in the PAGE context (MAIN world).
 */
(function () {
  'use strict';

  /**
   * Tokenize code into segments preserving strings and comments.
   * Returns an array of { type: 'code'|'string'|'line_comment'|'block_comment', value: string }
   */
  function tokenize(code) {
    var tokens = [];
    var i = 0;
    var len = code.length;
    var buf = '';

    while (i < len) {
      // Single-line comment
      if (code[i] === '-' && i + 1 < len && code[i + 1] === '-') {
        if (buf) { tokens.push({ type: 'code', value: buf }); buf = ''; }
        var end = code.indexOf('\n', i);
        if (end === -1) end = len;
        tokens.push({ type: 'line_comment', value: code.substring(i, end) });
        i = end;
        continue;
      }

      // Block comment
      if (code[i] === '/' && i + 1 < len && code[i + 1] === '*') {
        if (buf) { tokens.push({ type: 'code', value: buf }); buf = ''; }
        var endIdx = code.indexOf('*/', i + 2);
        if (endIdx === -1) endIdx = len - 2;
        tokens.push({ type: 'block_comment', value: code.substring(i, endIdx + 2) });
        i = endIdx + 2;
        continue;
      }

      // Quoted string
      if (code[i] === "'") {
        if (buf) { tokens.push({ type: 'code', value: buf }); buf = ''; }
        var j = i + 1;
        while (j < len) {
          if (code[j] === "'" && j + 1 < len && code[j + 1] === "'") {
            j += 2; // escaped quote
          } else if (code[j] === "'") {
            j++;
            break;
          } else {
            j++;
          }
        }
        tokens.push({ type: 'string', value: code.substring(i, j) });
        i = j;
        continue;
      }

      // q-quote: q'[...]', q'{...}', q'<...>', q'(...)', q'X...X'
      if ((code[i] === 'q' || code[i] === 'Q') && i + 2 < len && code[i + 1] === "'") {
        if (buf) { tokens.push({ type: 'code', value: buf }); buf = ''; }
        var delim = code[i + 2];
        var closeDelim;
        if (delim === '[') closeDelim = "]'";
        else if (delim === '{') closeDelim = "}'";
        else if (delim === '<') closeDelim = ">'";
        else if (delim === '(') closeDelim = ")'";
        else closeDelim = delim + "'";
        var qEnd = code.indexOf(closeDelim, i + 3);
        if (qEnd === -1) qEnd = len - closeDelim.length;
        var qEndPos = qEnd + closeDelim.length;
        tokens.push({ type: 'string', value: code.substring(i, qEndPos) });
        i = qEndPos;
        continue;
      }

      buf += code[i];
      i++;
    }
    if (buf) { tokens.push({ type: 'code', value: buf }); }
    return tokens;
  }

  /**
   * Strip comments and strings from code, replacing them with whitespace
   * of equivalent length (preserving line structure).
   */
  function stripNonCode(code) {
    var tokens = tokenize(code);
    var result = '';
    for (var t = 0; t < tokens.length; t++) {
      if (tokens[t].type === 'code') {
        result += tokens[t].value;
      } else {
        // Replace with spaces, preserving newlines
        var val = tokens[t].value;
        for (var c = 0; c < val.length; c++) {
          result += (val[c] === '\n') ? '\n' : ' ';
        }
      }
    }
    return result;
  }

  /**
   * Format PL/SQL code with proper indentation.
   * @param {string} code - The PL/SQL code to format.
   * @param {object} [options] - Formatting options.
   * @param {number} [options.tabSize=2] - Number of spaces per indent level.
   * @param {boolean} [options.upperCaseKeywords=true] - Uppercase keywords.
   * @returns {string} Formatted code.
   */
  function formatPlsql(code, options) {
    options = options || {};
    var tabSize = options.tabSize || 2;
    var upperCase = options.upperCaseKeywords !== false;
    var indent = '';
    for (var s = 0; s < tabSize; s++) indent += ' ';

    if (!code || !code.trim()) return code || '';

    // Normalize line endings
    code = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Get stripped version for keyword analysis
    var stripped = stripNonCode(code);

    // Split into lines, keeping track of original content
    var origLines = code.split('\n');
    var strippedLines = stripped.split('\n');

    var result = [];
    var level = 0;

    // Keywords that increase indent (next line)
    // We match against the stripped (no comments/strings) version
    var reBegin = /^\s*BEGIN\b/i;
    var reDeclare = /^\s*DECLARE\b/i;
    var reIs = /\b(IS|AS)\s*$/i;
    var reIsInline = /\b(IS|AS)\s*$/i;
    var reThen = /\bTHEN\s*$/i;
    var reLoop = /\bLOOP\s*$/i;
    var reElse = /^\s*ELSE\b/i;
    var reElsif = /^\s*ELSIF\b/i;
    var reException = /^\s*EXCEPTION\b/i;
    var reWhenException = /^\s*WHEN\b/i;
    var reCaseStart = /^\s*CASE\b/i;
    var reCaseInline = /\bCASE\b/i;

    // Keywords that decrease indent (this line)
    var reEnd = /^\s*END\s*(IF|LOOP|CASE|)?\s*;/i;
    var reEndLabel = /^\s*END\s+\w+\s*;/i;
    var reSlash = /^\s*\/\s*$/;

    // CREATE OR REPLACE
    var reCreate = /^\s*CREATE\s+(OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION|PACKAGE(\s+BODY)?|TRIGGER|TYPE(\s+BODY)?)\b/i;

    for (var i = 0; i < origLines.length; i++) {
      var origLine = origLines[i];
      var sLine = strippedLines[i];
      var trimmedStripped = sLine.trim();
      var trimmedOrig = origLine.trim();

      // Skip empty lines - preserve them but don't indent
      if (!trimmedOrig) {
        result.push('');
        continue;
      }

      // Determine indent adjustments for this line

      // Lines that dedent BEFORE printing (this line is at lower level)
      var dedentBefore = 0;
      var indentAfter = 0;

      // END ... ;
      if (reEnd.test(trimmedStripped) || reEndLabel.test(trimmedStripped)) {
        dedentBefore = 1;
      }
      // BEGIN after DECLARE — should be at the same level as DECLARE
      else if (reBegin.test(trimmedStripped)) {
        dedentBefore = 1;
      }
      // Standalone slash (PL/SQL block terminator)
      else if (reSlash.test(trimmedStripped)) {
        dedentBefore = level; // go to 0
      }
      // ELSIF - dedent then re-indent
      else if (reElsif.test(trimmedStripped)) {
        dedentBefore = 1;
      }
      // ELSE - dedent then re-indent
      else if (reElse.test(trimmedStripped)) {
        dedentBefore = 1;
      }
      // EXCEPTION - dedent one level (back to BEGIN level)
      else if (reException.test(trimmedStripped)) {
        dedentBefore = 1;
      }
      // WHEN inside EXCEPTION block (same level as EXCEPTION content)
      // We only dedent WHEN if we're at a level suggesting we're inside exception handler body
      // This is tricky - WHEN in CASE should indent, WHEN in EXCEPTION should align
      // We handle this contextually below

      // Apply dedent
      level = Math.max(0, level - dedentBefore);

      // Build the indented line
      var indentStr = '';
      for (var il = 0; il < level; il++) indentStr += indent;

      // Optionally uppercase keywords in the code portion
      var outputLine = trimmedOrig;
      if (upperCase) {
        outputLine = uppercaseKeywords(origLine.trim());
      }

      result.push(indentStr + outputLine);

      // Determine indent for NEXT line
      // BEGIN
      if (reBegin.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // DECLARE
      else if (reDeclare.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // CREATE ... IS/AS at end
      else if (reCreate.test(trimmedStripped) && reIsInline.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // CREATE without IS/AS - no indent yet
      else if (reCreate.test(trimmedStripped)) {
        indentAfter = 0;
      }
      // IS/AS at end of line (procedure/function declaration)
      else if (reIsInline.test(trimmedStripped) && !reEnd.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // THEN at end of line
      else if (reThen.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // LOOP at end of line
      else if (reLoop.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // ELSE (not ELSIF)
      else if (reElse.test(trimmedStripped) && !reElsif.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // ELSIF ... THEN
      else if (reElsif.test(trimmedStripped) && reThen.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // EXCEPTION
      else if (reException.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // WHEN ... THEN (in exception or case)
      else if (reWhenException.test(trimmedStripped) && reThen.test(trimmedStripped)) {
        indentAfter = 1;
      }
      // CASE (standalone)
      else if (reCaseStart.test(trimmedStripped) && !reEnd.test(trimmedStripped)) {
        indentAfter = 1;
      }

      level += indentAfter;
    }

    // Remove trailing empty lines
    while (result.length > 0 && result[result.length - 1] === '') {
      result.pop();
    }

    return result.join('\n') + '\n';
  }

  /**
   * Uppercase PL/SQL keywords in a line, but only in the code portions
   * (not inside strings or comments).
   * Uses the tokenizer to properly separate code from non-code segments.
   */
  function uppercaseKeywords(origLine) {
    var keywords = [
      'DECLARE', 'BEGIN', 'END', 'EXCEPTION', 'WHEN', 'THEN', 'ELSE', 'ELSIF',
      'IF', 'LOOP', 'FOR', 'WHILE', 'EXIT', 'CONTINUE', 'RETURN', 'CASE',
      'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
      'DELETE', 'MERGE', 'CREATE', 'OR', 'REPLACE', 'PROCEDURE', 'FUNCTION',
      'PACKAGE', 'BODY', 'TRIGGER', 'TYPE', 'IS', 'AS', 'IN', 'OUT', 'NOCOPY',
      'DEFAULT', 'NULL', 'NOT', 'AND', 'BETWEEN', 'LIKE', 'EXISTS', 'HAVING',
      'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'JOIN', 'INNER', 'LEFT', 'RIGHT',
      'OUTER', 'FULL', 'CROSS', 'ON', 'UNION', 'ALL', 'INTERSECT', 'MINUS',
      'DISTINCT', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'SEQUENCE',
      'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'CURSOR',
      'OPEN', 'FETCH', 'CLOSE', 'BULK', 'COLLECT', 'FORALL', 'LIMIT',
      'ROWTYPE', 'VARCHAR2', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE',
      'TIMESTAMP', 'CLOB', 'BLOB', 'CONSTANT', 'PRAGMA', 'AUTONOMOUS_TRANSACTION',
      'RAISE', 'RAISE_APPLICATION_ERROR', 'DBMS_OUTPUT', 'PUT_LINE',
      'NO_DATA_FOUND', 'TOO_MANY_ROWS', 'OTHERS', 'SQLCODE', 'SQLERRM',
      'EXECUTE', 'IMMEDIATE', 'USING', 'RETURNING', 'WITH'
    ];

    // Tokenize the line to separate code from strings/comments
    var tokens = tokenize(origLine);
    var result = '';

    for (var t = 0; t < tokens.length; t++) {
      if (tokens[t].type === 'code') {
        // Uppercase keywords only in code segments
        var segment = tokens[t].value;
        for (var k = 0; k < keywords.length; k++) {
          var re = new RegExp('\\b' + keywords[k] + '\\b', 'gi');
          segment = segment.replace(re, keywords[k]);
        }
        result += segment;
      } else {
        // Preserve strings, comments exactly as-is
        result += tokens[t].value;
      }
    }

    return result;
  }

  // Expose globally
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatPlsql: formatPlsql, tokenize: tokenize, stripNonCode: stripNonCode };
  } else {
    window.__formatPlsql = formatPlsql;
    window.__tokenizePlsql = tokenize;
  }

  if (typeof window !== 'undefined' && window.console) {
    console.log('[APEX Autocomplete] plsql-indenter.js loaded');
  }
})();
