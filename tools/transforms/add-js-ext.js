/**
 * jscodeshift transform to add .js extension to relative import/export specifiers
 * Usage:
 *   npx jscodeshift -t tools/transforms/add-js-ext.js packages/core/src --extensions=ts,tsx --parser=ts
 */

module.exports = function transformer(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  function shouldAdd(spec) {
    if (!spec || typeof spec.value !== 'string') return false;
    if (!spec.value.startsWith('./') && !spec.value.startsWith('../')) return false;
    // already has extension
    if (/\.[a-z0-9]+$/i.test(spec.value)) return false;
    return true;
  }

  // import declarations
  root.find(j.ImportDeclaration).forEach(path => {
    const s = path.node.source;
    if (shouldAdd(s)) s.value = s.value + '.js';
  });

  // export all declarations: export * from '...'
  root.find(j.ExportAllDeclaration).forEach(path => {
    const s = path.node.source;
    if (shouldAdd(s)) s.value = s.value + '.js';
  });

  // export named from: export { a } from '...'
  root.find(j.ExportNamedDeclaration).forEach(path => {
    const s = path.node.source;
    if (s && shouldAdd(s)) s.value = s.value + '.js';
  });

  // dynamic import() calls with string literal
  root.find(j.CallExpression, { callee: { type: 'Import' } }).forEach(path => {
    const arg = path.node.arguments[0];
    if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
      if ((arg.value.startsWith('./') || arg.value.startsWith('../')) && !/\.[a-z0-9]+$/i.test(arg.value)) {
        arg.value = arg.value + '.js';
      }
    }
  });

  return root.toSource({ quote: 'single' });
};
