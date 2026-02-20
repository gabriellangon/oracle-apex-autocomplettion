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

    // ── Protect strings and comments during pre-processing ──
    // Replace strings/comments with placeholders so keyword-splitting rules
    // don't accidentally modify them.
    var stringStore = [];
    var tokens = tokenize(code);
    var codeForPreprocess = '';
    for (var ti = 0; ti < tokens.length; ti++) {
      if (tokens[ti].type !== 'code') {
        var placeholder = '___STR' + stringStore.length + '___';
        stringStore.push(tokens[ti].value);
        codeForPreprocess += placeholder;
      } else {
        codeForPreprocess += tokens[ti].value;
      }
    }
    code = codeForPreprocess;

    // ── Pre-processing: restructure lines before indentation ──
    //
    // The goal is to take potentially compressed / single-line PL/SQL and
    // break it into one-statement-per-line form so the indenter can work.
    // We apply rules in order of priority.  Each pass is idempotent when
    // the code is already well-structured.

    // 1. Rejoin END that was split from IF/LOOP/CASE onto separate lines
    //    e.g. "END\n  LOOP;" => "END LOOP;", "END\n  IF;" => "END IF;"
    code = code.replace(/\bEND\s*\n\s*(LOOP|IF|CASE)\s*;/gi, 'END $1;');

    // 2. GENERAL: split after every semicolon that is followed by non-whitespace
    //    This is the most impactful rule — it ensures each statement gets its
    //    own line.  We run it in a loop because one pass might not catch nested
    //    cases (e.g. three statements on one line).
    //    IMPORTANT: uses stripNonCode to avoid splitting inside strings.
    var prevCode;
    do {
      prevCode = code;
      // Split "; WORD" but only when the WORD is code (not inside a string)
      // We use a function replacer to check against the stripped version.
      var tmpStripped = stripNonCode(code);
      var lines = code.split('\n');
      var sLines = tmpStripped.split('\n');
      var newLines = [];
      for (var si = 0; si < lines.length; si++) {
        var sLine = sLines[si];
        // Find "; " followed by a word character in the stripped version
        var splitIdx = -1;
        var depth = 0;
        for (var ci = 0; ci < sLine.length - 1; ci++) {
          if (sLine[ci] === '(') depth++;
          if (sLine[ci] === ')') depth--;
          if (depth === 0 && sLine[ci] === ';' && ci + 1 < sLine.length) {
            // Check if there's a non-space character after optional spaces
            var rest = sLine.substring(ci + 1).trim();
            if (rest.length > 0 && /^[A-Za-z_]/.test(rest)) {
              splitIdx = ci;
              break;
            }
          }
        }
        if (splitIdx >= 0) {
          // Split the original line at the same position
          newLines.push(lines[si].substring(0, splitIdx + 1));
          newLines.push(lines[si].substring(splitIdx + 1).trimStart());
        } else {
          newLines.push(lines[si]);
        }
      }
      code = newLines.join('\n');
    } while (code !== prevCode);

    // 3. Split BEGIN followed by ANY code onto separate lines
    //    e.g. "BEGIN FOR c1 IN" => "BEGIN\nFOR c1 IN"
    //    e.g. "BEGIN v_grade := 'A'" => "BEGIN\nv_grade := 'A'"
    code = code.replace(/\b(BEGIN)\s+(?!\s*$)([A-Za-z_])/gi, '$1\n$2');

    // 4. Split DECLARE followed by variable declarations
    //    e.g. "DECLARE v_count NUMBER;" => "DECLARE\nv_count NUMBER;"
    code = code.replace(/\b(DECLARE)\s+(\w)/gi, '$1\n$2');

    // 5. Split IS/AS followed by variable declarations (in procedures)
    //    e.g. "IS v_count NUMBER;" => "IS\nv_count NUMBER;"
    code = code.replace(/\b(IS|AS)\s+(\w+\s+(?:NUMBER|VARCHAR2|INTEGER|BOOLEAN|DATE|TIMESTAMP|CHAR|CLOB|BLOB|PLS_INTEGER|BINARY_INTEGER|RAW|LONG|CONSTANT|CURSOR)\b)/gi, '$1\n$2');

    // 6. Expand common inline closing clauses to their own lines.
    //    Example: "RETURN; END IF;" => "RETURN;\nEND IF;"
    code = code.replace(/;\s*(END\s+(IF|LOOP|CASE)\s*;)/gi, ';\n$1');
    code = code.replace(/;\s*(END\s+\w+\s*;)/gi, ';\n$1');
    code = code.replace(/;\s*(END\s*;)/gi, ';\n$1');

    // 7. Split inline THEN body onto its own line.
    //    Example: "IF x > 0 THEN y := 1;" => "IF x > 0 THEN\ny := 1;"
    //    But NOT "WHEN 'A' THEN" at end of line (followed by nothing)
    code = code.replace(/(\bTHEN)\s+(?!\s*$)(.+)/gi, '$1\n$2');

    // 8. Split LOOP followed by code onto separate lines
    code = code.replace(/(\bLOOP)\s+(?!\s*$)(?!END\b)(.+)/gi, '$1\n$2');

    // 9. Split ELSIF / ELSE / EXCEPTION / WHEN onto their own lines
    //    when they follow a semicolon (already handled by rule 2) or code
    code = code.replace(/;\s*(ELSIF\b)/gi, ';\n$1');
    code = code.replace(/;\s*(ELSE\b)/gi, ';\n$1');
    code = code.replace(/;\s*(EXCEPTION\b)/gi, ';\n$1');
    code = code.replace(/;\s*(WHEN\b)/gi, ';\n$1');

    // 9b. Split ELSE / EXCEPTION followed by code onto separate lines
    //     e.g. "ELSE DBMS_OUTPUT..." => "ELSE\nDBMS_OUTPUT..."
    //     e.g. "EXCEPTION WHEN" => "EXCEPTION\nWHEN"
    code = code.replace(/\b(ELSE)\s+(?!\s*$)(?!IF\b)([A-Za-z_])/gi, '$1\n$2');
    code = code.replace(/\b(EXCEPTION)\s+(WHEN\b)/gi, '$1\n$2');

    // 9c. Split CASE expression from WHEN
    //     e.g. "CASE v_grade WHEN 'A'" => "CASE v_grade\nWHEN 'A'"
    code = code.replace(/\b(CASE\s+\S+)\s+(WHEN\b)/gi, '$1\n$2');

    // 10. Split SQL clause keywords onto their own lines (inside SQL statements)
    //     This handles: SELECT ... FROM t WHERE ... AND ...
    //     becoming multi-line with FROM, WHERE, AND, etc. on separate lines.
    //     We only split when these keywords appear mid-line after a non-keyword word.
    code = code.replace(/\s+(FROM)\s+/gi, '\n$1 ');
    code = code.replace(/\s+(WHERE)\s+/gi, '\n$1 ');
    code = code.replace(/\s+(INTO)\s+(?!VALUES)/gi, '\n$1 ');
    code = code.replace(/\s+(SET)\s+/gi, '\n$1 ');
    code = code.replace(/\s+(ORDER\s+BY)\s+/gi, '\n$1 ');
    code = code.replace(/\s+(GROUP\s+BY)\s+/gi, '\n$1 ');
    code = code.replace(/\s+(HAVING)\s+/gi, '\n$1 ');
    // AND/OR when followed by a condition
    code = code.replace(/\s+(AND)\s+(?=\w+\s*[=<>!]|\w+\s+(?:IN|LIKE|BETWEEN|IS)\b)/gi, '\n$1 ');

    // ── Restore strings and comments from placeholders ──
    // Use split/join instead of replace to avoid $ being interpreted as
    // special replacement patterns ($1, $&, etc.) in string content.
    for (var ri = 0; ri < stringStore.length; ri++) {
      var ph = '___STR' + ri + '___';
      code = code.split(ph).join(stringStore[ri]);
    }

    // Get stripped version for keyword analysis
    var stripped = stripNonCode(code);

    // Split into lines, keeping track of original content
    var origLines = code.split('\n');
    var strippedLines = stripped.split('\n');

    var result = [];
    var level = 0;
    var inWhenThenBranch = false;
    var parenCallDepth = 0;
    var caseStack = [];  // tracks the indent level at which each CASE was opened

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
    var reEndCase = /^\s*END\s+CASE\s*;/i;

    // Keywords that decrease indent (this line)
    var reEnd = /^\s*END\s*(IF|LOOP|CASE|)?\s*;/i;
    var reEndLabel = /^\s*END\s+\w+\s*;/i;
    var reSlash = /^\s*\/\s*$/;

    function inCaseBlock() {
      return caseStack.length > 0;
    }

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

      var isEndLine = reEnd.test(trimmedStripped) || reEndLabel.test(trimmedStripped);
      var isEndCaseLine = reEndCase.test(trimmedStripped);
      var isWhenThenLine = reWhenException.test(trimmedStripped) && reThen.test(trimmedStripped);
      var isElseLine = reElse.test(trimmedStripped);
      var isCloseParenLine = /^\s*\)\s*;?\s*$/i.test(trimmedStripped);

      // If we are inside a WHEN ... THEN branch body and hit a sibling/closing
      // clause, first dedent to the WHEN level.
      if (inWhenThenBranch && (isWhenThenLine || isElseLine || isEndLine)) {
        dedentBefore += 1;
        inWhenThenBranch = false;
      }

      // END CASE; — jump back to the level where CASE was opened
      if (isEndCaseLine && caseStack.length > 0) {
        var caseLvl = caseStack.pop();
        dedentBefore = level - caseLvl;
      }
      // END ... ; (but not END CASE which is handled above)
      else if (isEndLine && !isEndCaseLine) {
        dedentBefore += 1;
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
      // ELSE inside CASE — treated as sibling of WHEN (same level)
      else if (isElseLine && inCaseBlock()) {
        // already handled by inWhenThenBranch dedent above; no extra dedent needed
      }
      // ELSE in IF — dedent then re-indent
      else if (isElseLine) {
        dedentBefore = 1;
      }
      // EXCEPTION - dedent one level (back to BEGIN level)
      else if (reException.test(trimmedStripped)) {
        dedentBefore = 1;
      }

      // Apply dedent
      level = Math.max(0, level - dedentBefore);

      // Continuation indentation for multiline procedure/function call arguments.
      // Supports nested calls by tracking parenthesis depth line-by-line.
      var continuationIndent = isCloseParenLine
        ? Math.max(0, parenCallDepth - 1)
        : parenCallDepth;

      // Build the indented line
      var indentStr = '';
      for (var il = 0; il < (level + continuationIndent); il++) indentStr += indent;

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
      else if (isWhenThenLine) {
        indentAfter = 1;
      }
      // CASE (standalone)
      else if (reCaseStart.test(trimmedStripped) && !reEnd.test(trimmedStripped)) {
        caseStack.push(level);
        indentAfter = 1;
      }
      // CASE used in assignment/expression form: x := CASE
      else if (/\bCASE\b/i.test(trimmedStripped) && !/\bEND\b/i.test(trimmedStripped)) {
        caseStack.push(level);
        indentAfter = 1;
      }

      level += indentAfter;

      if (isWhenThenLine) {
        inWhenThenBranch = true;
      }

      if (/\(\s*$/i.test(trimmedStripped) && !isCloseParenLine) {
        parenCallDepth += 1;
      }
      if (isCloseParenLine && parenCallDepth > 0) {
        parenCallDepth -= 1;
      }
    }

    // Remove trailing empty lines
    while (result.length > 0 && result[result.length - 1] === '') {
      result.pop();
    }

    // ── Post-processing: SQL keyword padding & column alignment ──
    //
    // Two modes of alignment:
    //
    // 1. Sub-SELECT (inside parentheses, e.g. FOR c1 IN (SELECT ...)):
    //    Align FROM/WHERE to the column position of SELECT.
    //    Align AND/OR further (to the column position of the condition after WHERE).
    //
    // 2. Top-level SQL (SELECT/INSERT/UPDATE/DELETE at line start):
    //    Pad keywords to a uniform 7-char width for simple column alignment.

    var PAD_WIDTH = 7;
    var sqlClauseKws = ['FROM', 'WHERE', 'INTO', 'SET', 'ORDER BY', 'GROUP BY', 'HAVING'];
    var sqlCondKws = ['AND', 'OR'];

    // Stack to handle nested sub-SELECTs
    // Each entry: { selectCol: <column of SELECT keyword>, whereCondCol: <column of WHERE condition>, isSubSelect: true/false }
    var sqlBlockStack = [];
    var currentSqlBlock = null;

    for (var p = 0; p < result.length; p++) {
      var line = result[p];
      var trimmed = line.trimStart();
      var leading = line.length - trimmed.length;
      var leadingSpaces = line.substring(0, leading);

      // ── Detect sub-SELECT inside parentheses ──
      var subSelectMatch = line.match(/\(\s*SELECT\b/i);
      if (subSelectMatch) {
        var selectCol = line.indexOf(subSelectMatch[0]) + subSelectMatch[0].indexOf('S');
        if (currentSqlBlock) sqlBlockStack.push(currentSqlBlock);
        currentSqlBlock = { selectCol: selectCol, whereCondCol: -1, isSubSelect: true };
        // Pad SELECT keyword on this line
        var selIdx = line.toUpperCase().indexOf('SELECT');
        if (selIdx >= 0) {
          var before = line.substring(0, selIdx);
          var after = line.substring(selIdx + 6).trimStart();
          result[p] = before + 'SELECT ' + after;
        }
        continue;
      }

      // ── Detect top-level SQL start ──
      if (!currentSqlBlock && (/^SELECT\b/i.test(trimmed) || /^INSERT\b/i.test(trimmed) ||
        /^UPDATE\b/i.test(trimmed) || /^DELETE\b/i.test(trimmed) || /^MERGE\b/i.test(trimmed))) {
        if (currentSqlBlock) sqlBlockStack.push(currentSqlBlock);
        currentSqlBlock = { selectCol: -1, whereCondCol: -1, isSubSelect: false };
      }

      // ── Apply alignment if inside a SQL block ──
      if (currentSqlBlock) {
        var isClauseKw = false;
        var isCondKw = false;
        var matchedKw = null;

        // Check for clause keywords (FROM, WHERE, INTO, etc.)
        for (var ck = 0; ck < sqlClauseKws.length; ck++) {
          var ckw = sqlClauseKws[ck];
          var ckRe = new RegExp('^(' + ckw + ')\\b', 'i');
          if (ckRe.test(trimmed)) {
            // Don't treat INTO as clause if it's INSERT INTO
            if (ckw === 'INTO') {
              var prevNE = '';
              for (var pp = p - 1; pp >= 0; pp--) {
                if (result[pp].trim()) { prevNE = result[pp].trim().toUpperCase(); break; }
              }
              if (/^INSERT\b/.test(prevNE)) break;
            }
            isClauseKw = true;
            matchedKw = ckw;
            break;
          }
        }

        // Check for condition keywords (AND, OR)
        if (!isClauseKw) {
          for (var dk = 0; dk < sqlCondKws.length; dk++) {
            var dkw = sqlCondKws[dk];
            var dkRe = new RegExp('^(' + dkw + ')\\b', 'i');
            if (dkRe.test(trimmed)) {
              isCondKw = true;
              matchedKw = dkw;
              break;
            }
          }
        }

        if (currentSqlBlock.isSubSelect && (isClauseKw || isCondKw)) {
          // ── Sub-SELECT: column-align to SELECT position ──
          var kwMatch = trimmed.match(new RegExp('^(' + matchedKw + ')\\s*(.*)', 'i'));
          if (kwMatch) {
            var kwText = kwMatch[1].toUpperCase();
            var kwRest = kwMatch[2];

            if (isClauseKw) {
              // Pad keyword to PAD_WIDTH and align to selectCol
              var paddedKw = kwText;
              while (paddedKw.length < PAD_WIDTH) paddedKw += ' ';
              var indent = '';
              for (var si = 0; si < currentSqlBlock.selectCol; si++) indent += ' ';
              result[p] = indent + paddedKw + kwRest;

              // If this is WHERE, record where the condition starts
              if (matchedKw === 'WHERE') {
                currentSqlBlock.whereCondCol = currentSqlBlock.selectCol + PAD_WIDTH;
              }
            } else if (isCondKw) {
              // AND/OR: indent to WHERE condition column if known
              if (currentSqlBlock.whereCondCol > 0) {
                var condIndent = '';
                for (var ci = 0; ci < currentSqlBlock.whereCondCol; ci++) condIndent += ' ';
                var paddedCondKw = kwText;
                while (paddedCondKw.length < PAD_WIDTH - 3) paddedCondKw += ' '; // shorter pad for AND/OR under WHERE
                result[p] = condIndent + paddedCondKw + kwRest;
              } else {
                // Fallback: align like clause keywords
                var paddedCondKw2 = kwText;
                while (paddedCondKw2.length < PAD_WIDTH) paddedCondKw2 += ' ';
                var indent2 = '';
                for (var si2 = 0; si2 < currentSqlBlock.selectCol; si2++) indent2 += ' ';
                result[p] = indent2 + paddedCondKw2 + kwRest;
              }
            }
          }
        } else if (!currentSqlBlock.isSubSelect && (isClauseKw || isCondKw)) {
          // ── Top-level SQL: simple keyword padding ──
          var kwMatch2 = trimmed.match(new RegExp('^(' + matchedKw + ')\\s*(.*)', 'i'));
          if (kwMatch2) {
            var paddedKw3 = kwMatch2[1].toUpperCase();
            while (paddedKw3.length < PAD_WIDTH) paddedKw3 += ' ';
            result[p] = leadingSpaces + paddedKw3 + kwMatch2[2];
          }
        } else if (!isClauseKw && !isCondKw && /^SELECT\b/i.test(trimmed) && currentSqlBlock && !currentSqlBlock.isSubSelect) {
          // Pad top-level SELECT
          var selMatch = trimmed.match(/^(SELECT)\s*(.*)/i);
          if (selMatch) {
            var paddedSel = selMatch[1].toUpperCase();
            while (paddedSel.length < PAD_WIDTH) paddedSel += ' ';
            result[p] = leadingSpaces + paddedSel + selMatch[2];
          }
        }
      }

      // ── End SQL block logic ──
      // End on semicolon or on LOOP keyword  
      if (/;\s*$/.test(trimmed) || /\)\s*\)\s*LOOP\s*$/i.test(trimmed) || /\)\s*LOOP\s*$/i.test(trimmed)) {
        if (currentSqlBlock) {
          currentSqlBlock = sqlBlockStack.length > 0 ? sqlBlockStack.pop() : null;
        }
      }
    }

    // ── Post-processing: parenthesis continuation alignment ──
    //
    // When a line has an unclosed '(', subsequent continuation lines are
    // indented to align with the first non-space character after '('.
    // This handles:
    //   - IN ('VAL1',\n'VAL2') → aligns 'VAL2' under 'VAL1'
    //   - function_call( param1,\nparam2 ) → aligns param2 under param1
    //
    // Lines starting with SQL/PL/SQL keywords or ')' are not realigned.

    var parenAlignStack = []; // stack of target indent columns

    for (var pa = 0; pa < result.length; pa++) {
      var paLine = result[pa];
      var paTrimmed = paLine.trimStart();

      if (!paTrimmed) continue;

      // Apply alignment if we have a pending target
      if (parenAlignStack.length > 0) {
        var startsWithClose = /^\)/.test(paTrimmed);
        var isSqlOrBlockKw = /^(SELECT|FROM|WHERE|INTO|SET|ORDER\s+BY|GROUP\s+BY|HAVING|AND|OR|BEGIN|END|LOOP|IF|THEN|ELSE|ELSIF|EXCEPTION|WHEN|DECLARE|CASE|FOR)\b/i.test(paTrimmed);

        if (!startsWithClose && !isSqlOrBlockKw) {
          var targetCol = parenAlignStack[parenAlignStack.length - 1];
          var newIndent = '';
          for (var ai = 0; ai < targetCol; ai++) newIndent += ' ';
          result[pa] = newIndent + paTrimmed;
          paLine = result[pa]; // update for scanning
        }
      }

      // Scan this line for unclosed parentheses (ignoring strings)
      var localOpens = []; // content columns for '(' opened on this line
      var inPStr = false, pStrChar = '';

      for (var pci = 0; pci < paLine.length; pci++) {
        var pch = paLine[pci];
        if (inPStr) {
          if (pch === pStrChar) {
            if (pci + 1 < paLine.length && paLine[pci + 1] === pStrChar) {
              pci++; // skip escaped quote
            } else {
              inPStr = false;
            }
          }
        } else {
          if (pch === "'" || pch === '"') {
            inPStr = true;
            pStrChar = pch;
          } else if (pch === '(') {
            // Find first non-space after '('
            var contentStart = pci + 1;
            while (contentStart < paLine.length && paLine[contentStart] === ' ') contentStart++;
            localOpens.push(contentStart);
          } else if (pch === ')') {
            if (localOpens.length > 0) {
              localOpens.pop(); // closed on same line
            } else if (parenAlignStack.length > 0) {
              parenAlignStack.pop(); // closed from a previous line
            }
          }
        }
      }

      // Push remaining unclosed opens to alignment stack
      for (var lo = 0; lo < localOpens.length; lo++) {
        parenAlignStack.push(localOpens[lo]);
      }
    }

    // ── Post-processing: trailing closing parentheses ──
    //
    // Join lines that contain only closing parentheses (with optional semicolon)
    // to the end of the previous non-empty content line.
    // Example:
    //   regexp_replace(..., '\1'
    //   )
    //   );
    // Becomes:
    //   regexp_replace(..., '\1'));
    //
    var finalResult = [];
    for (var tr = 0; tr < result.length; tr++) {
      var trLine = result[tr];
      var trTrimmed = trLine.trim();

      // Check if line is only closing parens (with optional semicolon and spaces)
      // e.g., ")", ");", "))", "));", etc.
      if (/^[\)\s;]+$/.test(trTrimmed) && trTrimmed.length > 0) {
        // Find the last non-empty line in finalResult to append to
        var appended = false;
        for (var back = finalResult.length - 1; back >= 0; back--) {
          if (finalResult[back].trim()) {
            finalResult[back] = finalResult[back] + trTrimmed;
            appended = true;
            break;
          }
        }
        if (!appended) {
          finalResult.push(trLine);
        }
      } else {
        finalResult.push(trLine);
      }
    }

    return finalResult.join('\n') + '\n';
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

})();
