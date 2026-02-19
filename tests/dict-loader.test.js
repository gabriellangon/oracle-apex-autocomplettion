/**
 * Tests for dict-loader.js
 * Validates that dictionaries received via CustomEvent are stored on window.
 */
const { loadScript } = require('./helpers');

describe('dict-loader', () => {
  let ctx;

  beforeEach(() => {
    ctx = loadScript('dict-loader.js', {
      document: document  // use jsdom's real document for events
    });
  });

  test('stores dictionary data on window when event is received', () => {
    const testData = { keywords: [{ label: 'SELECT' }] };
    document.dispatchEvent(new CustomEvent('__apexDict', {
      detail: { name: '__testDict', data: testData }
    }));
    expect(ctx.window.__testDict).toEqual(testData);
  });

  test('handles multiple dictionaries', () => {
    const sqlData = { keywords: [{ label: 'SELECT' }] };
    const plsqlData = { keywords: [{ label: 'DECLARE' }] };

    document.dispatchEvent(new CustomEvent('__apexDict', {
      detail: { name: '__sqlKeywords', data: sqlData }
    }));
    document.dispatchEvent(new CustomEvent('__apexDict', {
      detail: { name: '__plsqlKeywords', data: plsqlData }
    }));

    expect(ctx.window.__sqlKeywords).toEqual(sqlData);
    expect(ctx.window.__plsqlKeywords).toEqual(plsqlData);
  });

  test('overwrites previously stored dictionary', () => {
    const first = { keywords: [{ label: 'V1' }] };
    const second = { keywords: [{ label: 'V2' }] };

    document.dispatchEvent(new CustomEvent('__apexDict', {
      detail: { name: '__myDict', data: first }
    }));
    document.dispatchEvent(new CustomEvent('__apexDict', {
      detail: { name: '__myDict', data: second }
    }));

    expect(ctx.window.__myDict).toEqual(second);
  });
});
