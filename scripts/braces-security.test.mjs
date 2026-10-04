import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const braces = require('../docs-site/vendor/braces');
const isGuard = error => error instanceof SyntaxError && error.code === 'BRACES_COMPLEXITY_LIMIT';
test('ordinary brace expansion, ranges, escaped literals and regex compilation retain behavior', () => {
  assert.deepEqual(braces.expand('a/{b,c}/{1..3}'), ['a/b/1','a/b/2','a/b/3','a/c/1','a/c/2','a/c/3']);
  assert.equal(braces.compile('a/{b,c}'), 'a/(b|c)');
  assert.deepEqual(braces.expand('literal/\\{x\\}'), ['literal/{x}']);
  assert.equal(braces.stringify(braces.parse('a/{b,c}')), 'a/{b,c}');
});
test('deep valid and malformed patterns below the upstream character cap fail with a bounded error', () => {
  for (const pattern of ['{'.repeat(5000)+'x'+'}'.repeat(5000), '{'.repeat(5000)+'x', '('.repeat(5000)+'x'+')'.repeat(5000)]) {
    for (const method of ['parse','compile','expand','stringify']) assert.throws(() => braces[method](pattern), isGuard);
  }
});
test('direct AST and internal-module callers cannot bypass the depth guard', () => {
  let ast = {type:'text',value:'x'};
  for (let depth=0;depth<5000;depth++) ast={type:'root',nodes:[ast]};
  const cyclic={type:'root',nodes:[]};cyclic.nodes.push(cyclic);
  for (const method of ['compile','expand','stringify']) {
    const internal=require(`../docs-site/vendor/braces/lib/${method}`);
    assert.throws(()=>braces[method](ast),isGuard);
    assert.throws(()=>internal(ast),isGuard);
    assert.throws(()=>internal(cyclic),isGuard);
    assert.throws(()=>internal({type:'root',nodes:Array(65537).fill({type:'text',value:'x'})}),isGuard);
  }
});
