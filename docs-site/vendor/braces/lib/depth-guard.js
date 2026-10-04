'use strict';

// Local security fix for GHSA-vfj7-8cjw-p6xm. The upstream recursive walkers
// remain unchanged; reject inputs before reaching their unbounded recursion.
const MAX_DEPTH = 128;
const MAX_NODES = 65536;
const reject = () => {
  const error = new SyntaxError('Brace pattern or AST exceeds the supported complexity');
  error.code = 'BRACES_COMPLEXITY_LIMIT';
  throw error;
};
exports.assertPattern = input => {
  if (typeof input !== 'string') return; // Upstream preserves its type error.
  const stack = [];
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '\\') { index++; continue; }
    if (character === '{' || character === '(') {
      stack.push(character);
      if (stack.length > MAX_DEPTH) reject();
    } else if ((character === '}' && stack.at(-1) === '{') || (character === ')' && stack.at(-1) === '(')) stack.pop();
  }
};
exports.assertTree = root => {
  const stack = [[root, 0]];
  let visited = 0;
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (++visited > MAX_NODES || depth > MAX_DEPTH) reject();
    if (!node || !Array.isArray(node.nodes)) continue;
    if (visited + stack.length + node.nodes.length > MAX_NODES) reject();
    for (const child of node.nodes) stack.push([child, depth + 1]);
  }
};
