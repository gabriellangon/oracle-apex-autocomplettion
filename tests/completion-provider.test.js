/**
 * Tests for completion-provider.js
 * Validates autocomplete item building and provider behavior.
 */
const { loadScript, createMockMonaco, createMockEditor } = require('./helpers');

let monaco;
let createCompletionProvider;

beforeEach(() => {
  monaco = createMockMonaco();
  const ctx = loadScript('completion-provider.js', {
    window: {
      __sqlKeywords: {
        keywords: [
          { label: 'SELECT', category: 'dml', detail: 'Retrieve data' },
          { label: 'INSERT', category: 'dml', detail: 'Insert rows' }
        ],
        snippets: [
          {
            label: 'SELECT..FROM..WHERE',
            detail: 'Basic SELECT query',
            insertText: 'SELECT ${1:columns} FROM ${2:table} WHERE ${3:condition};'
          }
        ]
      },
      __plsqlKeywords: {
        keywords: [
          { label: 'DECLARE', category: 'block', detail: 'Declare section' },
          { label: 'BEGIN', category: 'block', detail: 'Begin block' }
        ],
        snippets: [
          {
            label: 'IF-THEN-ELSE',
            detail: 'If block',
            insertText: 'IF ${1:condition} THEN\n  ${2}\nEND IF;'
          }
        ]
      },
      __apexApi: {
        packages: [
          {
            name: 'APEX_JSON',
            procedures: [
              {
                label: 'APEX_JSON.OPEN_OBJECT',
                detail: 'Opens a JSON object',
                signature: 'APEX_JSON.OPEN_OBJECT(p_name IN VARCHAR2 DEFAULT NULL)'
              },
              {
                label: 'APEX_JSON.PARSE',
                detail: 'Parse JSON string',
                signature: 'APEX_JSON.PARSE(p_source IN VARCHAR2) RETURN CLOB'
              }
            ]
          }
        ]
      },
      __extractVariables: function (code) {
        return [{ name: 'l_test', type: 'VARCHAR2', line: 1 }];
      },
      monaco: monaco
    },
    monaco: monaco
  });
  createCompletionProvider = ctx.window.__createCompletionProvider;
});

describe('completion-provider', () => {
  test('exports __createCompletionProvider function', () => {
    expect(typeof createCompletionProvider).toBe('function');
  });

  test('creates a provider with triggerCharacters', () => {
    const provider = createCompletionProvider(monaco);
    expect(provider.triggerCharacters).toEqual(['.']);
  });

  test('creates a provider with provideCompletionItems function', () => {
    const provider = createCompletionProvider(monaco);
    expect(typeof provider.provideCompletionItems).toBe('function');
  });

  // ── General completion ─────────────────────────

  test('returns SQL keywords in suggestions', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: 'SEL' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 4 };

    const result = provider.provideCompletionItems(model, position);
    const labels = result.suggestions.map(s => s.label);
    expect(labels).toContain('SELECT');
    expect(labels).toContain('INSERT');
  });

  test('returns PL/SQL keywords in suggestions', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: 'DEC' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 4 };

    const result = provider.provideCompletionItems(model, position);
    const labels = result.suggestions.map(s => s.label);
    expect(labels).toContain('DECLARE');
    expect(labels).toContain('BEGIN');
  });


  test('returns SQL snippets in suggestions', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: '' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    const labels = result.suggestions.map(s => s.label);
    expect(labels).toContain('SELECT..FROM..WHERE');
  });

  test('returns snippets in suggestions', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: '' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    const snippetItems = result.suggestions.filter(
      s => s.kind === monaco.languages.CompletionItemKind.Snippet
    );
    expect(snippetItems.length).toBeGreaterThan(0);
    const snippetLabels = snippetItems.map(s => s.label);
    expect(snippetLabels).toContain('IF-THEN-ELSE');
  });


  test('keeps functional description in top-level detail and includes kind', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: '' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    const openObj = result.suggestions.find(s => s.label === 'APEX_JSON.OPEN_OBJECT');
    const parseFn = result.suggestions.find(s => s.label === 'APEX_JSON.PARSE');

    expect(openObj.detail).toBe('Opens a JSON object • procedure');
    expect(parseFn.detail).toBe('Parse JSON string • function');
  });

  test('returns APEX API packages in suggestions', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: '' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    const labels = result.suggestions.map(s => s.label);
    expect(labels).toContain('APEX_JSON');
    expect(labels).toContain('APEX_JSON.OPEN_OBJECT');
  });

  test('returns live variables in suggestions', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: 'l_test VARCHAR2(100);' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    const labels = result.suggestions.map(s => s.label);
    expect(labels).toContain('l_test');
  });

  test('variables are sorted before keywords (sortText prefix)', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: 'l_test VARCHAR2(100);' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    const varItem = result.suggestions.find(s => s.label === 'l_test');
    const kwItem = result.suggestions.find(s => s.label === 'SELECT');
    expect(varItem.sortText).toBe('1_l_test');
    expect(kwItem.sortText).toBe('2_SELECT');
  });

  // ── Package-dot completion ────────────────────

  test('returns package members after typing "APEX_JSON."', () => {
    const provider = createCompletionProvider(monaco);
    const content = 'APEX_JSON.';
    const model = createMockEditor({ content }).getModel();
    model.getLineContent.mockReturnValue('APEX_JSON.');
    model.getWordUntilPosition.mockReturnValue({ word: '', startColumn: 11, endColumn: 11 });

    const position = { lineNumber: 1, column: 11 };
    const result = provider.provideCompletionItems(model, position);

    const labels = result.suggestions.map(s => s.label);
    expect(labels).toContain('OPEN_OBJECT');
    expect(labels).toContain('PARSE');
    const openObject = result.suggestions.find(s => s.label === 'OPEN_OBJECT');
    expect(openObject.detail).toBe('Opens a JSON object • procedure');
    // Should NOT contain top-level items
    expect(labels).not.toContain('SELECT');
  });

  // ── Range is applied to all suggestions ───────

  test('each suggestion has a range property', () => {
    const provider = createCompletionProvider(monaco);
    const editor = createMockEditor({ content: '' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    result.suggestions.forEach(s => {
      expect(s.range).toBeDefined();
      expect(s.range.startLineNumber).toBe(1);
    });
  });

  // ── Edge cases ────────────────────────────────

  test('handles missing dictionaries gracefully', () => {
    const ctx2 = loadScript('completion-provider.js', {
      window: { monaco: monaco },
      monaco: monaco
    });
    const provider = ctx2.window.__createCompletionProvider(monaco);
    const editor = createMockEditor({ content: '' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    expect(result.suggestions).toBeDefined();
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  test('handles dictionaries with no keywords/snippets keys', () => {
    const ctx2 = loadScript('completion-provider.js', {
      window: { __sqlKeywords: {}, __plsqlKeywords: {}, __apexApi: {}, monaco: monaco },
      monaco: monaco
    });
    const provider = ctx2.window.__createCompletionProvider(monaco);
    const editor = createMockEditor({ content: '' });
    const model = editor.getModel();
    const position = { lineNumber: 1, column: 1 };

    const result = provider.provideCompletionItems(model, position);
    expect(result.suggestions).toBeDefined();
  });
});
