/**
 * monaco-poller.js
 * Runs in the page context (MAIN world).
 * Polls for window.monaco and signals readiness via a DOM attribute.
 */
(function () {
  'use strict';
  var attempts = 0;
  var iv = setInterval(function () {
    attempts++;
    if (window.monaco && window.monaco.editor) {
      clearInterval(iv);
      document.documentElement.setAttribute('data-apex-monaco-ready', '1');
    }
    if (attempts > 120) { // 60 seconds max
      clearInterval(iv);
      document.documentElement.setAttribute('data-apex-monaco-ready', 'timeout');
    }
  }, 500);
})();
