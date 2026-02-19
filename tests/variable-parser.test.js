/**
 * Tests for parsers/variable-parser.js
 * Validates PL/SQL variable extraction from code.
 */
const { loadScript } = require('./helpers');

let extractVariables;

beforeEach(() => {
  const ctx = loadScript('parsers/variable-parser.js');
  extractVariables = ctx.window.__extractVariables;
});

describe('variable-parser', () => {
  test('exports __extractVariables function', () => {
    expect(typeof extractVariables).toBe('function');
  });

  test('returns empty array for empty/null input', () => {
    expect(extractVariables('')).toEqual([]);
    expect(extractVariables(null)).toEqual([]);
    expect(extractVariables(undefined)).toEqual([]);
  });

  // ── Standard variable declarations ─────────────

  test('extracts VARCHAR2 variable', () => {
    const code = 'l_name VARCHAR2(100);';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'l_name', type: 'VARCHAR2', line: 1 }
    ]);
  });

  test('extracts NUMBER variable', () => {
    const code = 'l_count NUMBER;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'l_count', type: 'NUMBER', line: 1 }
    ]);
  });

  test('extracts BOOLEAN variable', () => {
    const code = 'l_flag BOOLEAN := TRUE;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'l_flag', type: 'BOOLEAN', line: 1 }
    ]);
  });

  test('extracts CONSTANT variable', () => {
    const code = 'c_max CONSTANT NUMBER := 100;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'c_max', type: 'NUMBER', line: 1 }
    ]);
  });

  test('extracts DATE variable', () => {
    const code = 'l_start_date DATE;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'l_start_date', type: 'DATE', line: 1 }
    ]);
  });

  test('extracts CLOB variable', () => {
    const code = 'l_content CLOB;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'l_content', type: 'CLOB', line: 1 }
    ]);
  });

  test('extracts variable with DEFAULT keyword', () => {
    const code = "l_status VARCHAR2(20) DEFAULT 'ACTIVE';";
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'l_status', type: 'VARCHAR2', line: 1 }
    ]);
  });

  // ── %TYPE and %ROWTYPE ────────────────────────

  test('extracts %TYPE variable', () => {
    const code = 'l_emp_name employees.first_name%TYPE;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'l_emp_name', type: 'employees.first_name%TYPE', line: 1 }
    ]);
  });

  test('extracts %ROWTYPE variable', () => {
    const code = 'l_emp_rec employees%ROWTYPE;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'l_emp_rec', type: 'employees%ROWTYPE', line: 1 }
    ]);
  });

  // ── Cursors ───────────────────────────────────

  test('extracts CURSOR declaration', () => {
    const code = 'CURSOR c_employees IS\n  SELECT * FROM employees;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'c_employees', type: 'CURSOR', line: 1 }
    ]);
  });

  // ── FOR loop variable ─────────────────────────

  test('extracts FOR loop variable', () => {
    const code = 'FOR rec IN c_employees LOOP';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'rec', type: 'RECORD (loop)', line: 1 }
    ]);
  });

  // ── Parameters ────────────────────────────────

  test('extracts IN parameter', () => {
    const code = '  p_emp_id IN NUMBER';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'p_emp_id', type: 'NUMBER', line: 1 }
    ]);
  });

  test('extracts OUT parameter', () => {
    const code = '  p_result OUT VARCHAR2';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'p_result', type: 'VARCHAR2', line: 1 }
    ]);
  });

  test('extracts IN OUT parameter', () => {
    const code = '  p_buffer IN OUT CLOB';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 'p_buffer', type: 'CLOB', line: 1 }
    ]);
  });

  // ── TYPE declarations ─────────────────────────

  test('extracts TYPE IS RECORD', () => {
    const code = 'TYPE t_emp_rec IS RECORD (';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 't_emp_rec', type: 'TYPE (RECORD)', line: 1 }
    ]);
  });

  test('extracts TYPE IS TABLE OF', () => {
    const code = 'TYPE t_emp_tab IS TABLE OF employees%ROWTYPE;';
    const vars = extractVariables(code);
    expect(vars).toEqual([
      { name: 't_emp_tab', type: 'TYPE (TABLE OF)', line: 1 }
    ]);
  });

  // ── Reserved words filtering ──────────────────

  test('does not extract reserved words as variables', () => {
    const code = 'DECLARE\nBEGIN\nEND;';
    const vars = extractVariables(code);
    expect(vars).toEqual([]);
  });

  // ── Comments are skipped ──────────────────────

  test('skips single-line comments', () => {
    const code = '-- l_comment VARCHAR2(100);';
    const vars = extractVariables(code);
    expect(vars).toEqual([]);
  });

  // ── Multiple variables with correct line numbers ─

  test('extracts multiple variables with correct line numbers', () => {
    const code = [
      'DECLARE',
      '  l_name VARCHAR2(100);',
      '  l_age NUMBER;',
      '  l_active BOOLEAN := TRUE;',
      'BEGIN',
      '  NULL;',
      'END;'
    ].join('\n');

    const vars = extractVariables(code);
    expect(vars).toHaveLength(3);
    expect(vars[0]).toEqual({ name: 'l_name', type: 'VARCHAR2', line: 2 });
    expect(vars[1]).toEqual({ name: 'l_age', type: 'NUMBER', line: 3 });
    expect(vars[2]).toEqual({ name: 'l_active', type: 'BOOLEAN', line: 4 });
  });

  // ── No duplicates ─────────────────────────────

  test('does not produce duplicate variables', () => {
    const code = 'l_val NUMBER;\nl_val NUMBER;';
    const vars = extractVariables(code);
    expect(vars).toHaveLength(1);
  });
});
