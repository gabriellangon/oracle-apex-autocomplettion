/**
 * Tests for formatter.js
 * Validates hybrid SQL/PL/SQL detection, SQL formatting (fallback),
 * Monaco integration, and edge cases.
 */
const { loadScript, createMockMonaco, createMockEditor } = require('./helpers');

describe('formatter.js', () => {
  let ctx;
  let monaco;

  /**
   * Set up a context with both the PL/SQL indenter and the formatter loaded.
   * The formatter depends on __formatPlsql being available for PL/SQL code.
   */
  function setupContext() {
    ctx = {};
    ctx.window = ctx;
    ctx.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    ctx.setTimeout = jest.fn(function (fn) { fn(); });
    ctx.setInterval = setInterval;
    ctx.clearInterval = clearInterval;
    ctx.Object = Object;
    ctx.JSON = JSON;
    ctx.Array = Array;
    ctx.RegExp = RegExp;
    ctx.MutationObserver = jest.fn(function () {
      return { observe: jest.fn(), disconnect: jest.fn() };
    });

    monaco = createMockMonaco();
    // Add registerDocumentFormattingEditProvider mock
    monaco.languages.registerDocumentFormattingEditProvider = jest.fn(function (langId, provider) {
      return { dispose: jest.fn() };
    });
    ctx.monaco = monaco;

    ctx.document = {
      querySelectorAll: jest.fn(function () { return []; }),
      body: {},
      documentElement: document.documentElement
    };

    // Load PL/SQL indenter first (it sets window.__formatPlsql)
    loadScript('plsql-indenter.js', ctx);
    // Then load formatter
    loadScript('formatter.js', ctx);

    return ctx;
  }

  beforeEach(() => {
    setupContext();
  });

  // ── Language detection ───────────────────────

  describe('detectLanguageType', () => {
    test('detects pure SQL as "sql"', () => {
      expect(ctx.__detectLanguageType('SELECT * FROM employees WHERE id = 1')).toBe('sql');
    });

    test('detects INSERT as "sql"', () => {
      expect(ctx.__detectLanguageType('INSERT INTO emp (name) VALUES (\'John\')')).toBe('sql');
    });

    test('detects UPDATE as "sql"', () => {
      expect(ctx.__detectLanguageType('UPDATE emp SET name = \'Jane\' WHERE id = 1')).toBe('sql');
    });

    test('detects DELETE as "sql"', () => {
      expect(ctx.__detectLanguageType('DELETE FROM emp WHERE id = 1')).toBe('sql');
    });

    test('detects CREATE TABLE as "sql"', () => {
      expect(ctx.__detectLanguageType('CREATE TABLE emp (id NUMBER, name VARCHAR2(100))')).toBe('sql');
    });

    test('detects MERGE as "sql"', () => {
      var code = 'MERGE INTO target t USING source s ON (t.id = s.id) WHEN MATCHED THEN UPDATE SET t.name = s.name';
      expect(ctx.__detectLanguageType(code)).toBe('sql');
    });

    test('detects DECLARE block as "plsql"', () => {
      expect(ctx.__detectLanguageType('DECLARE\n  l_x NUMBER;\nBEGIN\n  l_x := 1;\nEND;')).toBe('plsql');
    });

    test('detects BEGIN block as "plsql"', () => {
      expect(ctx.__detectLanguageType('BEGIN\n  NULL;\nEND;')).toBe('plsql');
    });

    test('detects CREATE PROCEDURE as "plsql"', () => {
      expect(ctx.__detectLanguageType('CREATE OR REPLACE PROCEDURE test_proc IS\nBEGIN\n  NULL;\nEND;')).toBe('plsql');
    });

    test('detects CREATE FUNCTION as "plsql"', () => {
      expect(ctx.__detectLanguageType('CREATE OR REPLACE FUNCTION get_val RETURN NUMBER IS\nBEGIN\n  RETURN 1;\nEND;')).toBe('plsql');
    });

    test('detects CREATE PACKAGE as "plsql"', () => {
      expect(ctx.__detectLanguageType('CREATE OR REPLACE PACKAGE my_pkg IS\nEND my_pkg;')).toBe('plsql');
    });

    test('detects CREATE PACKAGE BODY as "plsql"', () => {
      expect(ctx.__detectLanguageType('CREATE OR REPLACE PACKAGE BODY my_pkg IS\nEND my_pkg;')).toBe('plsql');
    });

    test('detects IF/THEN as "plsql"', () => {
      expect(ctx.__detectLanguageType('IF x > 0 THEN\n  y := 1;\nEND IF;')).toBe('plsql');
    });

    test('detects EXCEPTION as "plsql"', () => {
      expect(ctx.__detectLanguageType('EXCEPTION\n  WHEN OTHERS THEN\n    RAISE;')).toBe('plsql');
    });

    test('detects CURSOR as "plsql"', () => {
      expect(ctx.__detectLanguageType('CURSOR c_emp IS SELECT * FROM emp;')).toBe('plsql');
    });

    test('detects EXECUTE IMMEDIATE as "plsql"', () => {
      expect(ctx.__detectLanguageType("EXECUTE IMMEDIATE 'DROP TABLE temp'")).toBe('plsql');
    });

    test('detects DBMS_OUTPUT as "plsql"', () => {
      expect(ctx.__detectLanguageType("DBMS_OUTPUT.PUT_LINE('hello')")).toBe('plsql');
    });

    test('detects FOR ... IN loop as "plsql"', () => {
      expect(ctx.__detectLanguageType('FOR rec IN c_emp LOOP\n  NULL;\nEND LOOP;')).toBe('plsql');
    });

    test('returns "sql" for empty input', () => {
      expect(ctx.__detectLanguageType('')).toBe('sql');
      expect(ctx.__detectLanguageType(null)).toBe('sql');
    });

    test('ignores keywords inside strings', () => {
      // "BEGIN" is inside a string, so this should be treated as SQL
      var code = "SELECT 'BEGIN END DECLARE' FROM dual";
      expect(ctx.__detectLanguageType(code)).toBe('sql');
    });

    test('ignores keywords inside comments', () => {
      var code = "-- DECLARE\n-- BEGIN\nSELECT 1 FROM dual";
      expect(ctx.__detectLanguageType(code)).toBe('sql');
    });
  });

  // ── SQL formatting (fallback) ────────────────

  describe('formatSql (fallback, no sql-formatter library)', () => {
    test('formats a simple SELECT', () => {
      var code = 'select id, name from employees where id = 1';
      var result = ctx.__formatSql(code);
      // Should have keywords uppercased and on separate lines
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('WHERE');
    });

    test('handles empty input', () => {
      expect(ctx.__formatSql('')).toBe('');
      expect(ctx.__formatSql(null)).toBe('');
    });

    test('handles already formatted SQL', () => {
      var code = 'SELECT id\nFROM emp\nWHERE id = 1';
      var result = ctx.__formatSql(code);
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('WHERE');
    });
  });

  // ── SQL formatting with sql-formatter library ──

  describe('formatSql (with sql-formatter library)', () => {
    test('uses sql-formatter when available', () => {
      var mockFormat = jest.fn(function (code, opts) {
        return 'FORMATTED: ' + code;
      });
      ctx.sqlFormatter = { format: mockFormat };

      var result = ctx.__formatSql('SELECT 1 FROM dual');
      expect(mockFormat).toHaveBeenCalled();
      expect(mockFormat.mock.calls[0][1].language).toBe('plsql');
      expect(result).toContain('FORMATTED:');
    });

    test('passes tabWidth to sql-formatter', () => {
      var mockFormat = jest.fn(function (code, opts) { return code; });
      ctx.sqlFormatter = { format: mockFormat };

      ctx.__formatSql('SELECT 1', { tabSize: 4 });
      expect(mockFormat.mock.calls[0][1].tabWidth).toBe(4);
    });

    test('passes keywordCase to sql-formatter', () => {
      var mockFormat = jest.fn(function (code, opts) { return code; });
      ctx.sqlFormatter = { format: mockFormat };

      ctx.__formatSql('SELECT 1', { upperCaseKeywords: false });
      expect(mockFormat.mock.calls[0][1].keywordCase).toBe('preserve');
    });

    test('falls back if sql-formatter throws', () => {
      ctx.sqlFormatter = {
        format: jest.fn(function () { throw new Error('parse error'); })
      };

      // Should not throw, should use fallback
      var result = ctx.__formatSql('SELECT 1 FROM dual');
      expect(result).toBeTruthy();
      expect(ctx.console.warn).toHaveBeenCalled();
    });
  });

  // ── Hybrid formatCode ────────────────────────

  describe('formatCode (hybrid)', () => {
    test('uses PL/SQL indenter for procedural code', () => {
      var code = 'DECLARE\nl_x NUMBER;\nBEGIN\nl_x := 1;\nEND;';
      var result = ctx.__formatCode(code);
      var lines = result.trim().split('\n');
      expect(lines[0]).toBe('DECLARE');
      expect(lines[1]).toMatch(/^\s+/); // indented
      expect(lines[2]).toMatch(/BEGIN/);
    });

    test('uses SQL formatter for pure SQL', () => {
      var code = 'select id, name from employees where id = 1';
      var result = ctx.__formatCode(code);
      expect(result).toContain('SELECT');
    });

    test('handles empty input', () => {
      expect(ctx.__formatCode('')).toBe('');
      expect(ctx.__formatCode(null)).toBe('');
    });
  });

  // ── Monaco integration ───────────────────────

  describe('Monaco DocumentFormattingEditProvider', () => {
    test('registers formatting provider on sql-like languages', () => {
      expect(monaco.languages.registerDocumentFormattingEditProvider).toHaveBeenCalled();
      var calls = monaco.languages.registerDocumentFormattingEditProvider.mock.calls;
      var registeredLangs = calls.map(function (c) { return c[0]; });
      expect(registeredLangs).toContain('plaintext');
      expect(registeredLangs).toContain('sql');
    });

    test('formatting provider returns full-document edit', () => {
      var calls = monaco.languages.registerDocumentFormattingEditProvider.mock.calls;
      // Get the provider that was registered
      var provider = calls[0][1];

      // Create a mock model
      var model = {
        getValue: jest.fn(function () { return 'select 1 from dual'; }),
        getLineCount: jest.fn(function () { return 1; }),
        getLineMaxColumn: jest.fn(function () { return 20; })
      };

      var edits = provider.provideDocumentFormattingEdits(model, { tabSize: 2 });
      expect(edits).toHaveLength(1);
      expect(edits[0].range.startLineNumber).toBe(1);
      expect(edits[0].range.startColumn).toBe(1);
      expect(edits[0].range.endLineNumber).toBe(1);
      expect(edits[0].text).toBeTruthy();
    });

    test('formatting provider handles multiline PL/SQL', () => {
      var calls = monaco.languages.registerDocumentFormattingEditProvider.mock.calls;
      var provider = calls[0][1];

      var code = 'begin\nnull;\nend;';
      var model = {
        getValue: jest.fn(function () { return code; }),
        getLineCount: jest.fn(function () { return 3; }),
        getLineMaxColumn: jest.fn(function () { return 5; })
      };

      var edits = provider.provideDocumentFormattingEdits(model, { tabSize: 2 });
      expect(edits).toHaveLength(1);
      // The formatted output should have proper indentation
      expect(edits[0].text).toContain('BEGIN');
      expect(edits[0].text).toContain('END;');
    });
  });

  // ── Guard flag ───────────────────────────────

  describe('guard flag', () => {
    test('sets __apexFormatterActive guard flag', () => {
      expect(ctx.__apexFormatterActive).toBe(true);
    });

    test('does not re-initialize if already active', () => {
      // The flag was already set by the first load
      // Loading again should be a no-op
      var registerCallCount = monaco.languages.registerDocumentFormattingEditProvider.mock.calls.length;
      loadScript('formatter.js', ctx);
      // Should not have registered additional providers
      expect(monaco.languages.registerDocumentFormattingEditProvider.mock.calls.length).toBe(registerCallCount);
    });
  });

  // ── Edge cases ───────────────────────────────

  describe('edge cases', () => {
    test('handles code with mixed SQL and PL/SQL keywords in strings', () => {
      // Code contains BEGIN in a string but is actually just a SELECT
      var code = "SELECT 'BEGIN' AS keyword FROM dual";
      var result = ctx.__formatCode(code);
      // Should be treated as SQL
      expect(result).toContain('SELECT');
    });

    test('handles very short code', () => {
      var result = ctx.__formatCode('X');
      expect(result.trim()).toBe('X');
    });

    test('handles code with only comments', () => {
      var code = '-- just a comment\n-- another comment';
      var result = ctx.__formatCode(code);
      expect(result).toContain('-- just a comment');
    });

    test('handles PL/SQL with RAISE', () => {
      var code = 'BEGIN\nRAISE NO_DATA_FOUND;\nEND;';
      expect(ctx.__detectLanguageType(code)).toBe('plsql');
    });

    test('handles PRAGMA AUTONOMOUS_TRANSACTION', () => {
      var code = 'DECLARE\nPRAGMA AUTONOMOUS_TRANSACTION;\nBEGIN\nNULL;\nEND;';
      expect(ctx.__detectLanguageType(code)).toBe('plsql');
    });

    test('handles CREATE TRIGGER', () => {
      var code = 'CREATE OR REPLACE TRIGGER trg_test BEFORE INSERT ON emp FOR EACH ROW\nBEGIN\nNULL;\nEND;';
      expect(ctx.__detectLanguageType(code)).toBe('plsql');
    });
  });
});
