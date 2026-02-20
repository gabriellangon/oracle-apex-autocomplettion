/**
 * parsers/variable-parser.js
 * Extracts declared variables, cursors, parameters, and loop variables
 * from PL/SQL code for autocomplete suggestions.
 *
 * Runs in the PAGE context.
 */

(function () {
  'use strict';

  var RESERVED = {
    'DECLARE':1,'BEGIN':1,'END':1,'EXCEPTION':1,'IF':1,'THEN':1,'ELSIF':1,
    'ELSE':1,'LOOP':1,'WHILE':1,'FOR':1,'EXIT':1,'CONTINUE':1,'RETURN':1,
    'NULL':1,'TRUE':1,'FALSE':1,'SELECT':1,'INSERT':1,'UPDATE':1,'DELETE':1,
    'FROM':1,'WHERE':1,'AND':1,'OR':1,'NOT':1,'IN':1,'OUT':1,'IS':1,'AS':1,
    'INTO':1,'VALUES':1,'SET':1,'CREATE':1,'ALTER':1,'DROP':1,'TABLE':1,
    'VIEW':1,'INDEX':1,'SEQUENCE':1,'TRIGGER':1,'PROCEDURE':1,'FUNCTION':1,
    'PACKAGE':1,'BODY':1,'REPLACE':1,'GRANT':1,'REVOKE':1,'CURSOR':1,
    'OPEN':1,'FETCH':1,'CLOSE':1,'RAISE':1,'WHEN':1,'OTHERS':1,'PRAGMA':1,
    'TYPE':1,'SUBTYPE':1,'RECORD':1,'CONSTANT':1,'DEFAULT':1,'COMMIT':1,
    'ROLLBACK':1,'SAVEPOINT':1,'BULK':1,'COLLECT':1,'FORALL':1,'CASE':1,
    'WITH':1,'ON':1,'JOIN':1,'LEFT':1,'RIGHT':1,'INNER':1,'OUTER':1,
    'CROSS':1,'UNION':1,'MINUS':1,'INTERSECT':1,'ORDER':1,'GROUP':1,
    'HAVING':1,'DISTINCT':1,'ALL':1,'EXISTS':1,'BETWEEN':1,'LIKE':1
  };

  function isReserved(word) {
    return RESERVED[word.toUpperCase()] === 1;
  }

  /**
   * Extract declared variables from PL/SQL code.
   * @param {string} code
   * @returns {Array<{name:string, type:string, line:number}>}
   */
  function extractVariables(code) {
    if (!code) return [];

    var variables = [];
    var seen = {};
    var lines = code.split('\n');

    function add(name, type, lineNum) {
      var key = name.toUpperCase();
      if (!seen[key] && !isReserved(name)) {
        seen[key] = true;
        variables.push({ name: name, type: type, line: lineNum });
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var line = raw.replace(/^\s+/, ''); // ltrim
      var lineNum = i + 1;
      var m;

      // Skip empty / comments
      if (!line || line.indexOf('--') === 0) continue;

      // 1. variable_name CONSTANT? TYPE[(size)] [:= | DEFAULT | ;]
      m = line.match(
        /^(\w+)\s+(?:CONSTANT\s+)?(VARCHAR2|NUMBER|INTEGER|PLS_INTEGER|BINARY_INTEGER|DATE|TIMESTAMP|BOOLEAN|CLOB|BLOB|RAW|XMLTYPE|JSON|SYS_REFCURSOR|LONG|CHAR|NVARCHAR2|NCHAR|NCLOB|BINARY_FLOAT|BINARY_DOUBLE|SIMPLE_INTEGER|SIMPLE_FLOAT|SIMPLE_DOUBLE|NATURAL|NATURALN|POSITIVE|POSITIVEN|SIGNTYPE)(\([^)]*\))?\s*(;|:=|DEFAULT)/i
      );
      if (m) { add(m[1], m[2].toUpperCase(), lineNum); continue; }

      // 2. variable_name table.column%TYPE
      m = line.match(/^(\w+)\s+(\w+\.\w+)%TYPE\s*(;|:=|DEFAULT)/i);
      if (m) { add(m[1], m[2] + '%TYPE', lineNum); continue; }

      // 3. variable_name table%ROWTYPE
      m = line.match(/^(\w+)\s+(\w+)%ROWTYPE\s*(;|:=)/i);
      if (m) { add(m[1], m[2] + '%ROWTYPE', lineNum); continue; }

      // 4. CURSOR cursor_name IS
      m = line.match(/^CURSOR\s+(\w+)\s+IS/i);
      if (m) { add(m[1], 'CURSOR', lineNum); continue; }

      // 5. FOR rec IN ...
      m = line.match(/^FOR\s+(\w+)\s+IN\s/i);
      if (m) { add(m[1], 'RECORD (loop)', lineNum); continue; }

      // 6. param_name IN/OUT/IN OUT TYPE
      m = line.match(/^\s*(\w+)\s+(IN\s+OUT|IN|OUT)\s+(\w+)/i);
      if (m && !isReserved(m[1])) {
        add(m[1], m[3].toUpperCase(), lineNum);
        continue;
      }

      // 7. TYPE type_name IS RECORD|TABLE OF|VARRAY
      m = line.match(/^TYPE\s+(\w+)\s+IS\s+(RECORD|TABLE\s+OF|VARRAY)/i);
      if (m) { add(m[1], 'TYPE (' + m[2].toUpperCase() + ')', lineNum); continue; }
    }

    return variables;
  }

  window.__extractVariables = extractVariables;

})();
