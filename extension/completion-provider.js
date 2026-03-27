/**
 * completion-provider.js
 * Core autocomplete logic. Builds Monaco CompletionItemProvider
 * from SQL/PL/SQL keywords, APEX API dictionaries, and live variables.
 *
 * Runs in the PAGE context (has access to window.monaco).
 */

(function () {
  'use strict';

  var localAnalysisCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  // ── CompletionItemKind mapping ───────────────

  function getKind(monaco, category) {
    var K = monaco.languages.CompletionItemKind;
    var map = {
      dml: K.Keyword, clause: K.Keyword, join: K.Keyword,
      set: K.Keyword, condition: K.Keyword, expression: K.Keyword,
      alias: K.Keyword, modifier: K.Keyword, logical: K.Keyword,
      ddl: K.Keyword, dcl: K.Keyword, tcl: K.Keyword, dynamic: K.Keyword,
      block: K.Keyword, control: K.Keyword, loop: K.Keyword,
      cursor: K.Keyword, cursor_attr: K.Property, type_attr: K.Property,
      bulk: K.Keyword, type: K.TypeParameter, composite_type: K.Struct,
      exception: K.Event, program_unit: K.Keyword, parameter: K.Keyword,
      builtin_pkg: K.Function, 'function': K.Function, analytic: K.Function,
      apex_proc: K.Method, apex_func: K.Function, apex_pkg: K.Module,
      variable: K.Variable, snippet: K.Snippet
    };
    return map[category] || K.Text;
  }

  // ── Format signature for tooltip ────────────

  function formatSignature(sig) {
    if (!sig) return '';
    // Split at opening parenthesis
    var match = sig.match(/^([^(]+)\((.+)\)(.*)$/);
    if (!match) return sig;
    var name = match[1];
    var params = match[2];
    var suffix = match[3] || ''; // RETURN clause
    // Split parameters and format each on its own line
    var paramList = params.split(/,\s*/);
    // Always format on multiple lines if there are parameters
    return name + '(\n  ' + paramList.join(',\n  ') + '\n)' + suffix;
  }

  function getCompletionCase() {
    if (!window.__apexAutocompleteSettings) return 'upper';
    return window.__apexAutocompleteSettings.completionCase === 'lower' ? 'lower' : 'upper';
  }

  function applyCompletionCase(text, mode) {
    if (!text) return text;
    return mode === 'lower' ? text.toLowerCase() : text.toUpperCase();
  }

  function applyCompletionCaseToSnippet(text, mode) {
    if (!text) return text;

    var result = '';
    var lastIndex = 0;
    var placeholderRe = /\$\{[^}]*\}|\$\d+/g;
    var match;

    while ((match = placeholderRe.exec(text)) !== null) {
      result += applyCompletionCase(text.substring(lastIndex, match.index), mode);
      result += match[0];
      lastIndex = match.index + match[0].length;
    }

    result += applyCompletionCase(text.substring(lastIndex), mode);
    return result;
  }

  function applyCasePreference(item) {
    var mode = getCompletionCase();
    var result = Object.assign({}, item);

    if (result.__apexCaseType === 'keyword') {
      var keywordText = applyCompletionCase(result.label, mode);
      result.label = keywordText;
      result.insertText = keywordText;
      result.filterText = keywordText;
    } else if (result.__apexCaseType === 'snippet') {
      result.label = applyCompletionCase(result.label, mode);
      result.insertText = applyCompletionCaseToSnippet(result.insertText, mode);
    } else if (result.__apexCaseType === 'apex') {
      result.label = applyCompletionCase(result.label, mode);
      result.insertText = applyCompletionCase(result.insertText, mode);
      if (typeof result.filterText === 'string') {
        result.filterText = applyCompletionCase(result.filterText, mode);
      }
    }

    delete result.__apexCaseType;
    return result;
  }

  function applyCasePreferenceToSignature(signature) {
    if (!signature) return signature;

    var mode = getCompletionCase();
    var result = {
      label: signature.label,
      parameters: (signature.parameters || []).map(function (parameter) {
        return { label: parameter.label };
      })
    };

    if (signature.__apexCaseType === 'apex') {
      result.label = applyCompletionCase(result.label, mode);
      result.parameters = result.parameters.map(function (parameter) {
        return { label: applyCompletionCase(parameter.label, mode) };
      });
    }

    return result;
  }


  // ── Build items from dictionaries ────────────

  function buildKeywordItems(monaco, dict) {
    if (!dict || !dict.keywords) return [];
    return dict.keywords.map(function (kw) {
      return {
        label:      kw.label,
        kind:       getKind(monaco, kw.category),
        detail:     kw.detail || kw.category,
        insertText: kw.label,
        sortText:   '2_' + kw.label,
        filterText: kw.label,
        __apexCaseType: 'keyword'
      };
    });
  }

  function buildSnippetItems(monaco, dict) {
    if (!dict || !dict.snippets) return [];
    return dict.snippets.map(function (sn) {
      return {
        label:           sn.label,
        kind:            monaco.languages.CompletionItemKind.Snippet,
        detail:          sn.detail || 'Snippet',
        insertText:      sn.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText:        '4_' + sn.label,
        documentation:   sn.detail || '',
        __apexCaseType:  'snippet'
      };
    });
  }

  function buildApexItems(monaco, apiDict) {
    if (!apiDict || !apiDict.packages) return [];
    var items = [];
    apiDict.packages.forEach(function (pkg) {
      items.push({
        label:      pkg.name,
        kind:       getKind(monaco, 'apex_pkg'),
        detail:     'APEX Package',
        insertText: pkg.name,
        sortText:   '3_' + pkg.name,
        __apexCaseType: 'apex'
      });
      if (!pkg.procedures) return;
      pkg.procedures.forEach(function (proc) {
        // Use explicit 'kind' field if available, fallback to signature heuristic
        var isFunc = proc.kind === 'function' ||
          (!proc.kind && proc.signature && proc.signature.indexOf('RETURN') !== -1);
        var kindDetail = isFunc
          ? (proc.returnType ? 'function → ' + proc.returnType : 'function')
          : 'procedure';
        var detail = kindDetail;
        // Format signature with line breaks for readability
        var formattedSig = formatSignature(proc.signature);
        // Full documentation with alias info and signature
        var docParts = [];

        /*docParts.push('*' + kindDetail + '*' );*/
        if (formattedSig) docParts.push('```plsql\n' + formattedSig + '\n```');
        docParts.push('\n\n');
        /*if (proc.detail) docParts.push('alias for `' + proc.detail + '`');*/
        items.push({
          label:         proc.label,
          kind:          getKind(monaco, isFunc ? 'apex_func' : 'apex_proc'),
          detail:        detail,
          insertText:    proc.label,
          documentation: { value: docParts.join('\n\n') },
          sortText:      '3_' + proc.label,
          __apexCaseType: 'apex'
        });
      });
    });
    return items;
  }

  function buildVariableItems(monaco, variables) {
    return variables.map(function (v) {
      return {
        label:      v.name,
        kind:       getKind(monaco, 'variable'),
        detail:     v.type + ' (line ' + v.line + ')',
        insertText: v.name,
        sortText:   '1_' + v.name   // variables first
      };
    });
  }

  function buildLocalProgramData(monaco, code) {
    var items = [];
    var packageMap = {};
    if (!code) return { items: items, packageMap: packageMap };

    function addTopLevel(label, isFunc) {
      items.push({
        label: label,
        kind: isFunc ? monaco.languages.CompletionItemKind.Function
                     : monaco.languages.CompletionItemKind.Method,
        detail: isFunc ? 'function (local)' : 'procedure (local)',
        insertText: label,
        sortText: '1_' + label
      });
    }

    // CREATE [OR REPLACE] PACKAGE ... IS/AS ... END ...;
    var pkgRe = /CREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE(?:\s+BODY)?\s+(\w+)\s+(?:IS|AS)([\s\S]*?)END\s+\w*\s*;/gi;
    var pm;
    while ((pm = pkgRe.exec(code)) !== null) {
      var pkgName = pm[1];
      var upper = pkgName.toUpperCase();
      if (!packageMap[upper]) packageMap[upper] = [];

      var body = pm[2] || '';
      var memberRe = /\b(PROCEDURE|FUNCTION)\s+(\w+)/gi;
      var mm;
      while ((mm = memberRe.exec(body)) !== null) {
        var isFunc = mm[1].toUpperCase() === 'FUNCTION';
        var member = mm[2];
        addTopLevel(pkgName + '.' + member, isFunc);
        packageMap[upper].push({
          label: member,
          kind: isFunc ? monaco.languages.CompletionItemKind.Function
                       : monaco.languages.CompletionItemKind.Method,
          detail: isFunc ? 'function (local)' : 'procedure (local)',
          insertText: member,
          sortText: '1_' + member
        });
      }
    }

    // CREATE [OR REPLACE] standalone PROCEDURE/FUNCTION
    var standaloneRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION)\s+((?:\w+\.)?\w+)/gi;
    var sm;
    while ((sm = standaloneRe.exec(code)) !== null) {
      addTopLevel(sm[2], sm[1].toUpperCase() === 'FUNCTION');
    }

    return { items: items, packageMap: packageMap };
  }

  // ── Package-dot lookup ───────────────────────

  function buildPackageMap(monaco, apiDict) {
    var map = {};
    if (!apiDict || !apiDict.packages) return map;
    apiDict.packages.forEach(function (pkg) {
      if (!pkg.procedures) return;
      map[pkg.name.toUpperCase()] = pkg.procedures.map(function (proc) {
        var shortName = proc.label.indexOf('.') !== -1
          ? proc.label.split('.').pop()
          : proc.label;
        // Use explicit 'kind' field if available, fallback to signature heuristic
        var isFunc = proc.kind === 'function' ||
          (!proc.kind && proc.signature && proc.signature.indexOf('RETURN') !== -1);

        var kindDetail = isFunc
          ? (proc.returnType ? 'function → ' + proc.returnType : 'function')
          : 'procedure';
        var detail = kindDetail;
        // Format signature with line breaks for readability
        var formattedSig = formatSignature(proc.signature);
        // Full documentation with alias info and signature
        var docParts = [];

        /*docParts.push('*' + kindDetail + '*' + 'ok');*/
        if (formattedSig) docParts.push('```plsql\n' + formattedSig + '\n```');
        docParts.push('\n\n');
        /*if (proc.detail) docParts.push('alias for `' + proc.detail + '`');*/
        return {
          label:         shortName,
          kind:          isFunc ? monaco.languages.CompletionItemKind.Function
                                : monaco.languages.CompletionItemKind.Method,
          detail:        detail,
          insertText:    shortName,
          documentation: { value: docParts.join('\n\n') },
          sortText:      '1_' + shortName,
          __apexCaseType: 'apex'
        };
      });
    });
    return map;
  }

  // ── Detect package prefix before cursor ──────

  function getPackagePrefix(model, position) {
    var line = model.getLineContent(position.lineNumber);
    var before = line.substring(0, position.column - 1);
    // Match "WORD." at the end, including after the user typed the dot
    var m = before.match(/(\w+)\.\w*$/);
    if (m) return m[1].toUpperCase();
    // Also match if cursor is right after the dot: "APEX_JSON.|"
    m = before.match(/(\w+)\.$/);
    if (m) return m[1].toUpperCase();
    return null;
  }

  // ── Range helper ─────────────────────────────

  function getRange(model, position) {
    var info = model.getWordUntilPosition(position);
    return {
      startLineNumber: position.lineNumber,
      endLineNumber:   position.lineNumber,
      startColumn:     info.startColumn,
      endColumn:       position.column
    };
  }

  function getModelVersion(model, code) {
    if (model && typeof model.getVersionId === 'function') {
      return model.getVersionId();
    }
    return code;
  }

  function buildLocalAnalysis(monaco, code) {
    var vars = (typeof window.__extractVariables === 'function')
      ? window.__extractVariables(code) : [];
    return {
      code: code,
      vars: vars,
      localProgramData: buildLocalProgramData(monaco, code),
      localSignatureIndex: buildLocalSignatureIndex(code)
    };
  }

  function getLocalAnalysis(monaco, model) {
    var code = model.getValue();
    var version = getModelVersion(model, code);

    if (localAnalysisCache && model) {
      var cached = localAnalysisCache.get(model);
      if (cached && cached.version === version) {
        return cached.analysis;
      }

      var analysis = buildLocalAnalysis(monaco, code);
      localAnalysisCache.set(model, {
        version: version,
        analysis: analysis
      });
      return analysis;
    }

    return buildLocalAnalysis(monaco, code);
  }

  // ── Create the provider ──────────────────────

  function createCompletionProvider(monaco) {
    var sqlItems    = buildKeywordItems(monaco, window.__sqlKeywords);
    var plsqlItems  = buildKeywordItems(monaco, window.__plsqlKeywords);
    var sqlSnippets = buildSnippetItems(monaco, window.__sqlKeywords);
    var plsqlSnips  = buildSnippetItems(monaco, window.__plsqlKeywords);
    var snippets    = sqlSnippets.concat(plsqlSnips);
    var apexItems   = buildApexItems(monaco, window.__apexApi);
    var staticItems = sqlItems.concat(plsqlItems).concat(snippets).concat(apexItems);
    var packageMap  = buildPackageMap(monaco, window.__apexApi);


    return {
      triggerCharacters: ['.'],

      provideCompletionItems: function (model, position) {
        var range = getRange(model, position);
        var pkgPrefix = getPackagePrefix(model, position);

        var localAnalysis = getLocalAnalysis(monaco, model);
        var mergedPackageMap = Object.assign({}, packageMap, localAnalysis.localProgramData.packageMap);

        // After a dot → show only that package's members
        if (pkgPrefix && mergedPackageMap[pkgPrefix]) {
          return {
            suggestions: mergedPackageMap[pkgPrefix].map(function (item) {
              return Object.assign(applyCasePreference(item), { range: range });
            })
          };
        }

        // General completion: static items + live variables
        var varItems = buildVariableItems(monaco, localAnalysis.vars);

        var all = varItems.concat(localAnalysis.localProgramData.items).concat(staticItems);
        return {
          suggestions: all.map(function (item) {
            return Object.assign(applyCasePreference(item), { range: range });
          })
        };
      }
    };
  }

  function splitParams(paramsText) {
    if (!paramsText) return [];
    var parts = [];
    var current = '';
    var depth = 0;
    for (var i = 0; i < paramsText.length; i++) {
      var ch = paramsText.charAt(i);
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function parseSignature(signature, caseType) {
    if (!signature) return null;
    var m = signature.match(/^([^(]+)\((.*)\)(.*)$/);
    if (!m) {
      return { label: signature, parameters: [], __apexCaseType: caseType || null };
    }
    return {
      label: signature,
      parameters: splitParams(m[2]).map(function (p) { return { label: p }; }),
      __apexCaseType: caseType || null
    };
  }

  function buildSignatureIndex(apiDict) {
    var map = {};
    if (!apiDict || !apiDict.packages) return map;

    apiDict.packages.forEach(function (pkg) {
      (pkg.procedures || []).forEach(function (proc) {
        if (!proc.signature || !proc.label) return;
        var parsed = parseSignature(proc.signature, 'apex');
        var upperFull = proc.label.toUpperCase();
        map[upperFull] = parsed;
        var shortName = proc.label.indexOf('.') !== -1
          ? proc.label.split('.').pop()
          : proc.label;
        if (!map[shortName.toUpperCase()]) {
          map[shortName.toUpperCase()] = parsed;
        }
      });
    });
    return map;
  }

  function parseRoutineHeaders(blockText, qualifier) {
    var entries = [];
    if (!blockText) return entries;

    var headerRe = /\b(PROCEDURE|FUNCTION)\s+(\w+)/gi;
    var hm;
    while ((hm = headerRe.exec(blockText)) !== null) {
      var name = hm[2];
      var pos = headerRe.lastIndex;
      while (pos < blockText.length && /\s/.test(blockText.charAt(pos))) pos++;

      var paramsText = '';
      if (blockText.charAt(pos) === '(') {
        var depth = 0;
        var start = pos + 1;
        for (; pos < blockText.length; pos++) {
          var ch = blockText.charAt(pos);
          if (ch === '(') depth++;
          else if (ch === ')') {
            depth--;
            if (depth === 0) {
              paramsText = blockText.substring(start, pos);
              pos++;
              break;
            }
          }
        }
      }

      var fullName = qualifier ? qualifier + '.' + name : name;
      var signature = fullName + '(' + paramsText + ')';
      entries.push({
        fullName: fullName,
        shortName: name,
        parsed: parseSignature(signature, 'local')
      });
    }

    return entries;
  }

  function buildLocalSignatureIndex(code) {
    var map = {};
    if (!code) return map;

    var pkgRe = /CREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE(?:\s+BODY)?\s+(\w+)\s+(?:IS|AS)([\s\S]*?)END\s+\w*\s*;/gi;
    var pm;
    while ((pm = pkgRe.exec(code)) !== null) {
      var pkgName = pm[1];
      parseRoutineHeaders(pm[2] || '', pkgName).forEach(function (entry) {
        map[entry.fullName.toUpperCase()] = entry.parsed;
      });
    }

    var standaloneRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:EDITIONABLE\s+)?(PROCEDURE|FUNCTION)\s+((?:\w+\.)?\w+)([\s\S]*?)(?:\bIS\b|\bAS\b|;)/gi;
    var sm;
    while ((sm = standaloneRe.exec(code)) !== null) {
      var callable = sm[2];
      var paramsMatch = sm[3].match(/\(([^)]*)\)/);
      var paramsText = paramsMatch ? paramsMatch[1] : '';
      var parsed = parseSignature(callable + '(' + paramsText + ')', 'local');
      map[callable.toUpperCase()] = parsed;

      var shortName = callable.indexOf('.') !== -1
        ? callable.split('.').pop()
        : callable;
      if (!map[shortName.toUpperCase()]) {
        map[shortName.toUpperCase()] = parsed;
      }
    }

    return map;
  }

  function getOffsetFromPosition(text, position) {
    var lines = text.split('\n');
    var offset = 0;
    for (var i = 0; i < position.lineNumber - 1; i++) {
      offset += (lines[i] || '').length + 1;
    }
    return offset + (position.column - 1);
  }

  function findCallContext(text, offset) {
    var stack = [];
    for (var i = 0; i < offset; i++) {
      var ch = text.charAt(i);
      if (ch === '(') stack.push(i);
      if (ch === ')' && stack.length) stack.pop();
    }
    if (!stack.length) return null;

    var openParen = stack[stack.length - 1];
    var end = openParen - 1;
    while (end >= 0 && /\s/.test(text.charAt(end))) end--;
    var start = end;
    while (start >= 0 && /[A-Za-z0-9_$#.]/.test(text.charAt(start))) start--;
    var callable = text.substring(start + 1, end + 1);
    if (!callable) return null;

    var activeParameter = 0;
    var nestedDepth = 0;
    for (var j = openParen + 1; j < offset; j++) {
      var c = text.charAt(j);
      if (c === '(') nestedDepth++;
      else if (c === ')' && nestedDepth > 0) nestedDepth--;
      else if (c === ',' && nestedDepth === 0) activeParameter++;
    }

    return {
      callable: callable,
      activeParameter: activeParameter
    };
  }

  function createSignatureHelpProvider(monaco) {
    var signatureIndex = buildSignatureIndex(window.__apexApi);

    return {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],
      provideSignatureHelp: function (model, position) {
        var localAnalysis = getLocalAnalysis(monaco, model);
        var mergedSignatureIndex = Object.assign({}, signatureIndex, localAnalysis.localSignatureIndex);
        var code = localAnalysis.code;
        var offset = getOffsetFromPosition(code, position);
        var callContext = findCallContext(code, offset);
        if (!callContext) return null;

        var signature = mergedSignatureIndex[callContext.callable.toUpperCase()];
        if (!signature) return null;
        var displaySignature = applyCasePreferenceToSignature(signature);

        return {
          value: {
            signatures: [displaySignature],
            activeSignature: 0,
            activeParameter: Math.min(callContext.activeParameter, Math.max(0, displaySignature.parameters.length - 1))
          },
          dispose: function () {}
        };
      }
    };
  }

  // Expose to injected.js
  window.__createCompletionProvider = createCompletionProvider;
  window.__createSignatureHelpProvider = createSignatureHelpProvider;

})();
