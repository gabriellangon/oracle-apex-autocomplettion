/**
 * language-switcher.js
 * Runs in the PAGE context (MAIN world).
 * Exposes functions to list Monaco editors and switch their language.
 *
 * Communication with content-script is via DOM CustomEvents.
 */

(function () {
    'use strict';

    // ── List editors ────────────────────────────

    function getEditorInfos() {
        if (!window.monaco || !window.monaco.editor) return [];

        var editors = (typeof monaco.editor.getEditors === 'function')
            ? monaco.editor.getEditors()
            : [];

        return editors.map(function (editor, i) {
            var model = editor.getModel();
            var langId = 'unknown';
            var hint = '';

            if (model) {
                langId = (typeof model.getLanguageId === 'function')
                    ? model.getLanguageId()
                    : (model.getLanguageIdentifier
                        ? model.getLanguageIdentifier().language
                        : 'unknown');

                // Try to find a human-readable label from the DOM
                var domNode = editor.getDomNode();
                if (domNode) {
                    var container = domNode.closest('[data-item-id]') ||
                        domNode.closest('.a-MonacoEditor') ||
                        domNode.closest('.apex-item-code-editor');
                    if (container) {
                        var itemId = container.getAttribute('data-item-id') ||
                            container.getAttribute('id') || '';
                        if (itemId) hint = itemId;
                    }
                    // Also try looking for a nearby label element
                    if (!hint) {
                        var label = domNode.closest('.t-Form-fieldContainer');
                        if (label) {
                            var labelEl = label.querySelector('.t-Form-label');
                            if (labelEl) hint = labelEl.textContent.trim();
                        }
                    }
                }
            }

            return { index: i, language: langId, hint: hint };
        });
    }

    // ── Set editor language ─────────────────────

    function setEditorLanguage(editorIndex, languageId) {
        if (!window.monaco || !window.monaco.editor) return false;

        var editors = (typeof monaco.editor.getEditors === 'function')
            ? monaco.editor.getEditors()
            : [];

        if (editorIndex < 0 || editorIndex >= editors.length) return false;

        var model = editors[editorIndex].getModel();
        if (!model) return false;

        monaco.editor.setModelLanguage(model, languageId);
        return true;
    }

    // ── Listen for requests from content-script ─

    document.addEventListener('__apexGetEditors', function () {
        var infos = getEditorInfos();
        document.dispatchEvent(new CustomEvent('__apexEditorsResult', {
            detail: JSON.stringify(infos)
        }));
    });

    document.addEventListener('__apexSetLanguage', function (e) {
        var data = JSON.parse(e.detail);
        var ok = setEditorLanguage(data.editorIndex, data.languageId);
        document.dispatchEvent(new CustomEvent('__apexSetLanguageResult', {
            detail: JSON.stringify({ success: ok })
        }));
    });

})();
