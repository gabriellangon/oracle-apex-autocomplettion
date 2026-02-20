/**
 * dict-loader.js
 * Runs in the page context (MAIN world).
 * Listens for dictionary data sent from the content script via CustomEvents,
 * and exposes them as window globals for the completion provider.
 */
(function () {
    'use strict';

    document.addEventListener('__apexDict', function (e) {
        var name = e.detail.name;
        var data = e.detail.data;
        window[name] = data;
    });
})();
