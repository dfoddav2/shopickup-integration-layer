/**
 * jscodeshift transform to convert imports like './dir.js' -> './dir/index.js'
 * when './dir' is actually a directory with an index.ts file.
 * Usage:
 *   npx jscodeshift -t tools/transforms/fix-dir-imports.js packages/core/src --extensions=ts --parser=ts
 */

const fs = require('fs');
const path = require('path');

module.exports = function transformer(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  const fileDir = path.dirname(fileInfo.path);

  function isDirWithIndex(specVal) {
    // specVal is relative path with .js (e.g. ../interfaces.js)
    // compute resolved path without .js and check for index.ts
    const withoutExt = specVal.replace(/\.js$/i, '');
    const resolved = path.resolve(fileDir, withoutExt);
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        // check for index.ts or index.tsx
        const idxTs = path.join(resolved, 'index.ts');
        const idxTsx = path.join(resolved, 'index.tsx');
        const idxJs = path.join(resolved, 'index.js');
        return fs.existsSync(idxTs) || fs.existsSync(idxTsx) || fs.existsSync(idxJs);
      }
    } catch (e) {
      // not a directory
    }
    return false;
  }

  function fixSourceNode(s) {
    if (!s || typeof s.value !== 'string') return;
    if (!/^\.\.?\//.test(s.value)) return; // not relative
    if (!/\.js$/i.test(s.value)) return; // must end with .js
    if (isDirWithIndex(s.value)) {
      // change './interfaces.js' -> './interfaces/index.js'
      const withoutExt = s.value.replace(/\.js$/i, '');
      s.value = withoutExt + '/index.js';
    }
  }

  root.find(j.ImportDeclaration).forEach(path => {
    fixSourceNode(path.node.source);
  });

  root.find(j.ExportAllDeclaration).forEach(path => {
    fixSourceNode(path.node.source);
  });

  root.find(j.ExportNamedDeclaration).forEach(path => {
    fixSourceNode(path.node.source);
  });

  root.find(j.CallExpression, { callee: { type: 'Import' } }).forEach(path => {
    const arg = path.node.arguments[0];
    if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
      if (/^\.\.?\//.test(arg.value) && /\.js$/i.test(arg.value)) {
        if (isDirWithIndex(arg.value)) {
          const withoutExt = arg.value.replace(/\.js$/i, '');
          arg.value = withoutExt + '/index.js';
        }
      }
    }
  });

  return root.toSource({ quote: 'single' });
};
