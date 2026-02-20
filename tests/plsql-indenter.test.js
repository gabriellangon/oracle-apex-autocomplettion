/**
 * Tests for plsql-indenter.js
 * Validates PL/SQL indentation for procedural blocks, nesting,
 * string/comment preservation, and edge cases.
 */
const { loadScript } = require('./helpers');

describe('plsql-indenter.js', () => {
  let ctx;

  beforeEach(() => {
    ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.document = document;
    ctx.module = { exports: {} };
    loadScript('plsql-indenter.js', ctx);
  });

  function format(code, opts) {
    return ctx.module.exports.formatPlsql(code, opts);
  }

  function tokenize(code) {
    return ctx.module.exports.tokenize(code);
  }

  // ── Tokenizer tests ──────────────────────────

  describe('tokenize', () => {
    test('tokenizes plain code', () => {
      var tokens = tokenize('SELECT 1 FROM dual');
      expect(tokens.length).toBe(1);
      expect(tokens[0].type).toBe('code');
      expect(tokens[0].value).toBe('SELECT 1 FROM dual');
    });

    test('tokenizes single-line comments', () => {
      var tokens = tokenize("SELECT 1 -- comment\nFROM dual");
      expect(tokens.length).toBe(3);
      expect(tokens[0].type).toBe('code');
      expect(tokens[1].type).toBe('line_comment');
      expect(tokens[1].value).toBe('-- comment');
      expect(tokens[2].type).toBe('code');
    });

    test('tokenizes block comments', () => {
      var tokens = tokenize("SELECT /* block */ 1");
      expect(tokens.length).toBe(3);
      expect(tokens[0].type).toBe('code');
      expect(tokens[1].type).toBe('block_comment');
      expect(tokens[1].value).toBe('/* block */');
      expect(tokens[2].type).toBe('code');
    });

    test('tokenizes quoted strings', () => {
      var tokens = tokenize("x := 'hello world';");
      expect(tokens.length).toBe(3);
      expect(tokens[0].type).toBe('code');
      expect(tokens[1].type).toBe('string');
      expect(tokens[1].value).toBe("'hello world'");
      expect(tokens[2].type).toBe('code');
    });

    test('handles escaped quotes in strings', () => {
      var tokens = tokenize("x := 'it''s done';");
      expect(tokens.length).toBe(3);
      expect(tokens[1].type).toBe('string');
      expect(tokens[1].value).toBe("'it''s done'");
    });

    test('tokenizes q-quoted strings', () => {
      var tokens = tokenize("x := q'[hello 'world']';");
      expect(tokens.length).toBe(3);
      expect(tokens[1].type).toBe('string');
      expect(tokens[1].value).toBe("q'[hello 'world']'");
    });

    test('handles multiline block comments', () => {
      var code = "a;\n/* line1\nline2\nline3 */\nb;";
      var tokens = tokenize(code);
      var comments = tokens.filter(t => t.type === 'block_comment');
      expect(comments.length).toBe(1);
      expect(comments[0].value).toContain('line1');
      expect(comments[0].value).toContain('line3');
    });
  });

  // ── Simple block indentation ─────────────────

  describe('simple blocks', () => {
    test('indents BEGIN/END block', () => {
      var code = 'BEGIN\nDBMS_OUTPUT.PUT_LINE(1);\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('BEGIN');
      expect(lines[1]).toMatch(/^\s{2}/); // indented
      expect(lines[2]).toBe('END;');
    });

    test('indents DECLARE/BEGIN/END block', () => {
      var code = 'DECLARE\nl_x NUMBER;\nBEGIN\nl_x := 1;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('DECLARE');
      expect(lines[1]).toMatch(/^\s{2}/); // l_x NUMBER indented
      expect(lines[2]).toBe('BEGIN');
      expect(lines[3]).toMatch(/^\s{2}/); // l_x := 1 indented
      expect(lines[4]).toBe('END;');
    });

    test('handles custom tab size', () => {
      var code = 'BEGIN\nx := 1;\nEND;';
      var result = format(code, { tabSize: 4 });
      var lines = result.trim().split('\n');
      expect(lines[1]).toMatch(/^\s{4}/); // 4-space indent
    });
  });

  // ── IF/ELSIF/ELSE ────────────────────────────

  describe('IF blocks', () => {
    test('indents IF/THEN/END IF', () => {
      var code = 'BEGIN\nIF x > 0 THEN\ny := 1;\nEND IF;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('BEGIN');
      expect(lines[1]).toMatch(/^\s{2}IF/);
      expect(lines[2]).toMatch(/^\s{4}/); // body inside IF
      expect(lines[3]).toMatch(/^\s{2}END IF;/);
      expect(lines[4]).toBe('END;');
    });

    test('indents IF/ELSIF/ELSE/END IF', () => {
      var code = 'BEGIN\nIF x > 0 THEN\na := 1;\nELSIF x = 0 THEN\nb := 2;\nELSE\nc := 3;\nEND IF;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      // ELSIF should be at same level as IF
      expect(lines[3]).toMatch(/^\s{2}ELSIF/);
      // ELSE should be at same level as IF
      expect(lines[5]).toMatch(/^\s{2}ELSE/);
      // Body after ELSE should be indented
      expect(lines[6]).toMatch(/^\s{4}/);
      expect(lines[7]).toMatch(/^\s{2}END IF;/);
    });

    test('splits inline END IF onto a new aligned line', () => {
      var code = 'BEGIN\nIF x > 0 THEN\nRETURN; END IF;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[1]).toMatch(/^\s{2}IF x > 0 THEN$/);
      expect(lines[2]).toMatch(/^\s{4}RETURN;$/);
      expect(lines[3]).toMatch(/^\s{2}END IF;$/);
      expect(lines[4]).toBe('END;');
    });
  });

  // ── LOOP blocks ──────────────────────────────

  describe('LOOP blocks', () => {
    test('indents simple LOOP', () => {
      var code = 'BEGIN\nLOOP\nx := x + 1;\nEXIT WHEN x > 10;\nEND LOOP;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[1]).toMatch(/^\s{2}LOOP/);
      expect(lines[2]).toMatch(/^\s{4}/); // body indented
      expect(lines[4]).toMatch(/^\s{2}END LOOP;/);
    });

    test('indents FOR loop', () => {
      var code = 'BEGIN\nFOR i IN 1..10 LOOP\nDBMS_OUTPUT.PUT_LINE(i);\nEND LOOP;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[1]).toMatch(/^\s{2}FOR/);
      expect(lines[2]).toMatch(/^\s{4}/);
      expect(lines[3]).toMatch(/^\s{2}END LOOP;/);
    });

    test('indents WHILE loop', () => {
      var code = 'BEGIN\nWHILE x > 0 LOOP\nx := x - 1;\nEND LOOP;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[1]).toMatch(/^\s{2}WHILE/);
      expect(lines[2]).toMatch(/^\s{4}/);
      expect(lines[3]).toMatch(/^\s{2}END LOOP;/);
    });
  });

  // ── EXCEPTION blocks ─────────────────────────

  describe('EXCEPTION blocks', () => {
    test('indents EXCEPTION/WHEN', () => {
      var code = 'BEGIN\nx := 1;\nEXCEPTION\nWHEN NO_DATA_FOUND THEN\ny := 0;\nWHEN OTHERS THEN\nRAISE;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('BEGIN');
      expect(lines[1]).toMatch(/^\s{2}/); // x := 1 indented
      expect(lines[2]).toBe('EXCEPTION'); // EXCEPTION at BEGIN level
      expect(lines[3]).toMatch(/^\s{2}WHEN/); // WHEN indented once
    });

    test('keeps global END aligned with BEGIN after EXCEPTION WHEN OTHERS', () => {
      var code = [
        'BEGIN',
        'x := 1;',
        'EXCEPTION',
        'WHEN OTHERS THEN',
        'NULL;',
        'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('BEGIN');
      expect(lines[2]).toBe('EXCEPTION');
      expect(lines[3]).toMatch(/^\s{2}WHEN OTHERS THEN$/);
      expect(lines[5]).toBe('END;');
    });
  });

  // ── CREATE PROCEDURE/FUNCTION ────────────────

  describe('CREATE statements', () => {
    test('indents CREATE OR REPLACE PROCEDURE', () => {
      var code = 'CREATE OR REPLACE PROCEDURE test_proc IS\nBEGIN\nNULL;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toMatch(/^CREATE/);
      // BEGIN is at same level as CREATE (standard PL/SQL convention)
      expect(lines[1]).toBe('BEGIN');
      expect(lines[2]).toMatch(/^\s{2}NULL/); // body indented
      expect(lines[3]).toBe('END;');
    });

    test('indents CREATE FUNCTION with IS block', () => {
      var code = 'CREATE OR REPLACE FUNCTION get_val RETURN NUMBER IS\nl_val NUMBER;\nBEGIN\nl_val := 1;\nRETURN l_val;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toMatch(/^CREATE/);
      expect(lines[1]).toMatch(/^\s{2}/); // l_val declaration indented
      // BEGIN dedents back to CREATE level
      expect(lines[2]).toBe('BEGIN');
      expect(lines[3]).toMatch(/^\s{2}/); // body inside BEGIN
    });
  });

  // ── Nested blocks ────────────────────────────

  describe('nested blocks', () => {
    test('handles nested IF inside LOOP', () => {
      var code = [
        'BEGIN',
        'FOR i IN 1..10 LOOP',
        'IF i > 5 THEN',
        'DBMS_OUTPUT.PUT_LINE(i);',
        'END IF;',
        'END LOOP;',
        'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('BEGIN');
      expect(lines[1]).toMatch(/^\s{2}FOR/);       // level 1
      expect(lines[2]).toMatch(/^\s{4}IF/);         // level 2
      expect(lines[3]).toMatch(/^\s{6}/);            // level 3
      expect(lines[4]).toMatch(/^\s{4}END IF;/);    // level 2
      expect(lines[5]).toMatch(/^\s{2}END LOOP;/);  // level 1
      expect(lines[6]).toBe('END;');                 // level 0
    });

    test('handles deeply nested blocks', () => {
      var code = [
        'DECLARE',
        'l_x NUMBER;',
        'BEGIN',
        'IF TRUE THEN',
        'FOR i IN 1..5 LOOP',
        'IF i > 3 THEN',
        'NULL;',
        'END IF;',
        'END LOOP;',
        'END IF;',
        'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      // Check level 3 nesting (NULL inside IF inside FOR inside IF)
      expect(lines[6]).toMatch(/^\s{8}/); // 4 levels deep: 8 spaces
    });
  });

  // ── Package body ─────────────────────────────

  describe('package formatting', () => {
    test('formats a complete package body', () => {
      var code = [
        'CREATE OR REPLACE PACKAGE BODY my_pkg IS',
        'PROCEDURE do_stuff IS',
        'BEGIN',
        'NULL;',
        'END;',
        'FUNCTION get_val RETURN NUMBER IS',
        'BEGIN',
        'RETURN 1;',
        'END;',
        'END my_pkg;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toMatch(/^CREATE/);
      // Procedures inside package should be indented
      expect(lines[1]).toMatch(/^\s{2}PROCEDURE/);
      expect(lines[2]).toMatch(/^\s{2}BEGIN/);
      expect(lines[3]).toMatch(/^\s{4}NULL/);
      expect(lines[4]).toMatch(/^\s{2}END;/);
    });
  });

  // ── String and comment preservation ──────────

  describe('string and comment preservation', () => {
    test('preserves string content during formatting', () => {
      var code = "BEGIN\nx := 'BEGIN END IF THEN';\nEND;";
      var result = format(code);
      // The string should not be modified
      expect(result).toContain("'BEGIN END IF THEN'");
    });

    test('preserves line comments', () => {
      var code = 'BEGIN\n-- This is a comment\nx := 1;\nEND;';
      var result = format(code);
      expect(result).toContain('-- This is a comment');
    });

    test('preserves block comments', () => {
      var code = 'BEGIN\n/* multi\n   line\n   comment */\nx := 1;\nEND;';
      var result = format(code);
      expect(result).toContain('/* multi');
    });
  });

  // ── Edge cases ───────────────────────────────

  describe('edge cases', () => {
    test('handles empty string', () => {
      expect(format('')).toBe('');
      expect(format(null)).toBe('');
      expect(format(undefined)).toBe('');
    });

    test('handles whitespace-only string', () => {
      expect(format('   \n  \n  ')).toBe('   \n  \n  ');
    });

    test('handles single statement', () => {
      var result = format('SELECT 1 FROM dual;');
      // After SQL clause splitting, FROM goes to its own line with padding
      expect(result.trim()).toBe('SELECT 1\nFROM   dual;');
    });

    test('handles already-formatted code', () => {
      var code = [
        'BEGIN',
        '  x := 1;',
        'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('BEGIN');
      expect(lines[1]).toMatch(/^\s{2}/);
      expect(lines[2]).toBe('END;');
    });

    test('preserves empty lines between sections', () => {
      var code = 'BEGIN\nx := 1;\n\ny := 2;\nEND;';
      var result = format(code);
      expect(result).toContain('\n\n');
    });

    test('handles standalone slash (block terminator)', () => {
      var code = 'BEGIN\nNULL;\nEND;\n/';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[lines.length - 1]).toBe('/');
    });
  });

  // ── CASE expression ──────────────────────────

  describe('CASE blocks', () => {
    test('indents CASE/WHEN/END CASE', () => {
      var code = [
        'BEGIN',
        'CASE',
        'WHEN x = 1 THEN',
        'y := 10;',
        'WHEN x = 2 THEN',
        'y := 20;',
        'ELSE',
        'y := 0;',
        'END CASE;',
        'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[1]).toMatch(/^\s{2}CASE/);
      expect(lines[2]).toMatch(/^\s{4}WHEN/);
      expect(lines[3]).toMatch(/^\s{6}/); // body inside WHEN THEN
    });

    test('keeps CASE WHEN branches at one level and aligns END with CASE', () => {
      var code = [
        'BEGIN',
        'CASE',
        'WHEN a = 1 THEN',
        'v := 1;',
        'WHEN b = 2 THEN',
        'v := 2;',
        'END;',
        'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[1]).toMatch(/^\s{2}CASE$/);
      expect(lines[2]).toMatch(/^\s{4}WHEN a = 1 THEN$/);
      expect(lines[4]).toMatch(/^\s{4}WHEN b = 2 THEN$/);
      expect(lines[6]).toMatch(/^\s{2}END;$/);
      expect(lines[7]).toBe('END;');
    });
  });


  test('indents CASE expression with END; without breaking following lines', () => {
    var code = [
      'BEGIN',
      'x := CASE',
      'WHEN a = 1 THEN',
      "'A'",
      'WHEN a = 2 THEN',
      "'B'",
      'END;',
      'y := 42;',
      'END;'
    ].join('\n');
    var result = format(code);
    var lines = result.trim().split('\n');
    expect(lines[1]).toMatch(/^\s{2}x := CASE/);
    expect(lines[2]).toMatch(/^\s{4}WHEN/);
    expect(lines[3]).toMatch(/^\s{6}'A'/);
    expect(lines[4]).toMatch(/^\s{4}WHEN/);
    expect(lines[6]).toMatch(/^\s{2}END;/);
    expect(lines[7]).toMatch(/^\s{2}y := 42;/);
    expect(lines[8]).toBe('END;');
  });

  test('indents multiline function call parameters one level deeper than call name', () => {
    var code = [
      'BEGIN',
      'apex_theme.SET_USER_STYLE (',
      'p_id => l_style_id',
      ');',
      'END;'
    ].join('\n');
    var result = format(code);
    var lines = result.trim().split('\n');
    // With trailing close style, the closing paren joins the last parameter line
    expect(lines[1]).toMatch(/^\s{2}apex_theme.SET_USER_STYLE \($/);
    expect(lines[2]).toMatch(/p_id => l_style_id\);$/);
  });


  test('indents nested multiline function calls across multiple levels', () => {
    var code = [
      'BEGIN',
      'owa_util.redirect_url(',
      'apex_page.get_url (',
      'p_page => :app_page_id',
      ')',
      ');',
      'END;'
    ].join('\n');
    var result = format(code);
    var lines = result.trim().split('\n');
    // With trailing close style, closing parens join the last content line
    expect(lines[1]).toMatch(/^\s{2}owa_util.redirect_url\($/);
    expect(lines[2]).toMatch(/apex_page.get_url \($/);
    expect(lines[3]).toMatch(/p_page => :app_page_id\)\);$/);
  });

  // ── Inline THEN body splitting ─────────────────

  describe('inline THEN body', () => {
    test('splits inline THEN body onto its own line and aligns END IF', () => {
      var code = 'BEGIN\nIF x > 0 THEN y := 1; END IF;\nEND;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('BEGIN');
      expect(lines[1]).toMatch(/^\s{2}IF x > 0 THEN$/);
      expect(lines[2]).toMatch(/^\s{4}y := 1;$/);
      expect(lines[3]).toMatch(/^\s{2}END IF;$/);
      expect(lines[4]).toBe('END;');
    });
  });

  // ── CASE + ELSE alignment ───────────────────────

  describe('CASE with ELSE', () => {
    test('aligns END CASE with CASE when ELSE is present', () => {
      var code = [
        'BEGIN', 'CASE', 'WHEN a = 1 THEN', 'v := 10;',
        'ELSE', 'v := 0;', 'END CASE;', 'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[1]).toMatch(/^\s{2}CASE$/);
      expect(lines[2]).toMatch(/^\s{4}WHEN/);
      expect(lines[4]).toMatch(/^\s{4}ELSE$/);
      expect(lines[5]).toMatch(/^\s{6}/);
      expect(lines[6]).toMatch(/^\s{2}END CASE;$/);
      expect(lines[7]).toBe('END;');
    });

    test('formats real-world DECLARE/BEGIN/CASE/EXCEPTION correctly', () => {
      var code = [
        'DECLARE', 'l_result VARCHAR2(100);', 'BEGIN', 'CASE',
        "WHEN :P1_STATUS = 'A' THEN", "l_result := 'Active';",
        "WHEN :P1_STATUS = 'I' THEN", "l_result := 'Inactive';",
        'ELSE', "l_result := 'Unknown';", 'END CASE;',
        ':P1_RESULT := l_result;', 'EXCEPTION', 'WHEN OTHERS THEN',
        "l_result := 'Error';", 'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('DECLARE');
      expect(lines[2]).toBe('BEGIN');
      expect(lines[3]).toMatch(/^\s{2}CASE$/);
      expect(lines[10]).toMatch(/^\s{2}END CASE;$/);
      expect(lines[11]).toMatch(/^\s{2}:P1_RESULT/);
      expect(lines[12]).toBe('EXCEPTION');
      expect(lines[13]).toMatch(/^\s{2}WHEN OTHERS THEN$/);
      expect(lines[15]).toBe('END;');
    });

    test('handles CASE with ELSE inside an IF block', () => {
      var code = [
        'BEGIN', 'IF x > 0 THEN', 'CASE', 'WHEN a = 1 THEN', 'v := 10;',
        'ELSE', 'v := 0;', 'END CASE;', 'END IF;', 'END;'
      ].join('\n');
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[2]).toMatch(/^\s{4}CASE$/);
      expect(lines[7]).toMatch(/^\s{4}END CASE;$/);
      expect(lines[8]).toMatch(/^\s{2}END IF;$/);
      expect(lines[9]).toBe('END;');
    });
  });

  // ── Uppercase keywords option ────────────────

  describe('keyword casing', () => {
    test('uppercases keywords by default', () => {
      var code = 'begin\nnull;\nend;';
      var result = format(code);
      expect(result).toContain('BEGIN');
      expect(result).toContain('END;');
    });

    test('preserves case when upperCaseKeywords is false', () => {
      var code = 'begin\nnull;\nend;';
      var result = format(code, { upperCaseKeywords: false });
      expect(result).toContain('begin');
      expect(result).toContain('end;');
    });
  });

  // ── DPriver reference formatting ────────────────

  describe('dpriver-style formatting', () => {
    test('pads SQL clause keywords for alignment', () => {
      var code = 'SELECT COUNT(*) INTO v_count FROM employees WHERE department_id = 10 AND salary > 5000;';
      var result = format(code, { tabSize: 4 });
      var lines = result.trim().split('\n');
      // FROM, WHERE, INTO, AND should be padded to 7 chars
      expect(lines.some(l => /FROM\s{3}/.test(l.trim()))).toBe(true);
      expect(lines.some(l => /WHERE\s{2}/.test(l.trim()))).toBe(true);
      expect(lines.some(l => /INTO\s{3}/.test(l.trim()))).toBe(true);
      expect(lines.some(l => /AND\s{4}/.test(l.trim()))).toBe(true);
    });

    test('splits compound statements after semicolons', () => {
      var code = 'DECLARE v_count NUMBER; v_name VARCHAR2(100);';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(3); // DECLARE, v_count, v_name
      expect(lines[0]).toBe('DECLARE');
    });

    test('splits BEGIN from following code', () => {
      var code = 'BEGIN v_x := 1; END;';
      var result = format(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('BEGIN');
      expect(lines[1]).toMatch(/v_x/);
    });

    test('splits CASE expression from WHEN', () => {
      var code = "CASE v_grade WHEN 'A' THEN v_result := 'Excellent'; END CASE;";
      var result = format(code);
      expect(result).toMatch(/CASE v_grade\n/i);
      expect(result).toMatch(/WHEN 'A' THEN\n/i);
    });

    test('splits EXCEPTION from WHEN', () => {
      var code = 'BEGIN\nnull;\nEXCEPTION WHEN NO_DATA_FOUND THEN\nnull;\nEND;';
      var result = format(code);
      expect(result).toMatch(/EXCEPTION\n/i);
      expect(result).toMatch(/WHEN NO_DATA_FOUND THEN/i);
    });

    test('splits ELSE from following code', () => {
      var code = 'IF x > 0 THEN\ny := 1;\nELSE y := 0;\nEND IF;';
      var result = format(code);
      expect(result).toMatch(/ELSE\n/i);
    });

    test('formats procedure with IS and variable declarations', () => {
      var code = 'CREATE OR REPLACE PROCEDURE my_proc IS v_x NUMBER; BEGIN NULL; END my_proc;';
      var result = format(code, { tabSize: 4 });
      var lines = result.trim().split('\n');
      expect(lines[0]).toMatch(/CREATE OR REPLACE PROCEDURE my_proc IS/i);
      expect(lines.some(l => l.trim().match(/v_x NUMBER;/i))).toBe(true);
    });

    test('protects strings from keyword splitting', () => {
      var code = "BEGIN\nx := 'SELECT FROM WHERE AND INTO';\nEND;";
      var result = format(code);
      expect(result).toContain("'SELECT FROM WHERE AND INTO'");
    });

    test('formats complete dpriver-style example', () => {
      var code = 'DECLARE v_count NUMBER; v_name VARCHAR2(100); BEGIN SELECT COUNT(*) INTO v_count FROM employees WHERE department_id = 10; IF v_count > 0 THEN DBMS_OUTPUT.PUT_LINE(v_count); ELSIF v_count = 0 THEN DBMS_OUTPUT.PUT_LINE(\'None\'); ELSE DBMS_OUTPUT.PUT_LINE(\'Error\'); END IF; END;';
      var result = format(code, { tabSize: 4 });
      var lines = result.trim().split('\n');
      // Should have proper structure
      expect(lines[0]).toBe('DECLARE');
      expect(lines.some(l => l.trim() === 'BEGIN')).toBe(true);
      expect(lines.some(l => /ELSIF/i.test(l.trim()))).toBe(true);
      expect(lines.some(l => /^ELSE$/i.test(l.trim()))).toBe(true);
      expect(lines.some(l => /END IF;/i.test(l.trim()))).toBe(true);
      expect(lines[lines.length - 1]).toBe('END;');
    });
  });
});
