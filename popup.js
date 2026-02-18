/**
 * popup.js
 * Extension popup logic.
 * Communicates with the content script to detect Monaco editors
 * and let the user switch their language.
 */

(function () {
    'use strict';

    var LANGUAGES = [
        { id: 'plaintext', label: 'Plain Text' },
        { id: 'plsql', label: 'PL/SQL' },
        { id: 'sql', label: 'SQL' },
        { id: 'javascript', label: 'JavaScript' },
        { id: 'typescript', label: 'TypeScript' },
        { id: 'html', label: 'HTML' },
        { id: 'css', label: 'CSS' },
        { id: 'json', label: 'JSON' }
    ];

    var listEl = document.getElementById('editors-list');
    var statusEl = document.getElementById('status');
    var noEditors = document.getElementById('no-editors');

    // ── Ask the content script for editors ──────

    function requestEditors() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) {
                showEmpty();
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_EDITORS' }, function (response) {
                if (chrome.runtime.lastError || !response) {
                    showEmpty();
                    return;
                }
                renderEditors(response.editors || []);
            });
        });
    }

    // ── Render editor cards ─────────────────────

    function renderEditors(editors) {
        listEl.innerHTML = '';

        if (editors.length === 0) {
            showEmpty();
            return;
        }

        noEditors.style.display = 'none';
        statusEl.textContent = editors.length + ' editor' + (editors.length > 1 ? 's' : '') + ' detected';

        editors.forEach(function (ed, index) {
            var card = document.createElement('div');
            card.className = 'editor-card';

            // Badge for current language
            var badgeClass = getBadgeClass(ed.language);

            card.innerHTML =
                '<div class="editor-label">' +
                '<span>Editor ' + (index + 1) + '</span>' +
                '<span class="badge ' + badgeClass + '">' + ed.language + '</span>' +
                (ed.hint ? '<span style="color:#585b70;font-size:11px">— ' + escapeHtml(ed.hint) + '</span>' : '') +
                '</div>' +
                '<div class="language-row">' +
                '<label>Switch to:</label>' +
                '<select data-index="' + index + '"></select>' +
                '</div>';

            var select = card.querySelector('select');
            LANGUAGES.forEach(function (lang) {
                var opt = document.createElement('option');
                opt.value = lang.id;
                opt.textContent = lang.label;
                if (lang.id === ed.language) opt.selected = true;
                select.appendChild(opt);
            });

            select.addEventListener('change', function () {
                var newLang = this.value;
                var editorIndex = parseInt(this.getAttribute('data-index'), 10);
                setEditorLanguage(editorIndex, newLang);

                // Update badge
                var badge = card.querySelector('.badge');
                badge.textContent = newLang;
                badge.className = 'badge ' + getBadgeClass(newLang);

                showToast('Switched to ' + newLang);
            });

            listEl.appendChild(card);
        });
    }

    // ── Send language change to content script ──

    function setEditorLanguage(editorIndex, languageId) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'SET_LANGUAGE',
                editorIndex: editorIndex,
                languageId: languageId
            });
        });
    }

    // ── Helpers ─────────────────────────────────

    function getBadgeClass(lang) {
        if (lang === 'plsql' || lang === 'sql' || lang === 'oracle' || lang === 'oraclesql') return 'plsql';
        if (lang === 'javascript') return 'javascript';
        if (lang === 'typescript') return 'typescript';
        if (lang === 'html') return 'html';
        if (lang === 'css') return 'css';
        if (lang === 'json') return 'json';
        return 'plaintext';
    }

    function showEmpty() {
        statusEl.textContent = '';
        listEl.innerHTML = '';
        noEditors.style.display = 'block';
    }

    function showToast(msg) {
        var existing = document.querySelector('.toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        document.body.appendChild(toast);

        requestAnimationFrame(function () {
            toast.classList.add('show');
        });

        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () { toast.remove(); }, 200);
        }, 1500);
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Init ────────────────────────────────────

    requestEditors();
})();
