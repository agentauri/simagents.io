#!/usr/bin/env node
// Read-only inventory: product text is reviewed before conversion; experiment data is untouched.
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const files = execFileSync('rg', ['--files', 'apps/web/src'], { encoding: 'utf8' }).trim().split('\n').filter(file => file.endsWith('.tsx'));
const found = new Map();
const record = (text, node, source, file, kind) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!/[a-zA-Z]/.test(normalized) || ['ms', 'CITY', 'JSON', 'CSV', '2D', 'ISO'].includes(normalized)) return;
  const locations = found.get(normalized) ?? [];
  locations.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind });
  found.set(normalized, locations);
};
for (const file of files) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const textExpression = node => {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) record(node.text, node, source, file, 'expression');
    else if (ts.isConditionalExpression(node)) { textExpression(node.whenTrue); textExpression(node.whenFalse); }
    else if (ts.isParenthesizedExpression(node)) textExpression(node.expression);
    else if (ts.isTemplateExpression(node)) record(node.getText(source), node, source, file, 'template');
  };
  const visit = node => {
    if (ts.isJsxText(node)) record(node.text, node, source, file, 'jsx');
    if (ts.isJsxAttribute(node) && ['title', 'aria-label', 'placeholder', 'alt', 'label', 'description', 'subtitle', 'heading', 'tooltip', 'helperText', 'emptyMessage', 'sectionName'].includes(node.name.getText(source)) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) record(node.initializer.text, node.initializer, source, file, 'attribute');
      else if (ts.isJsxExpression(node.initializer)) textExpression(node.initializer.expression);
    }
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) textExpression(node.expression);
    if (ts.isPropertyAssignment(node) && ['label', 'description', 'title'].includes(node.name.getText(source))) textExpression(node.initializer);
    if (ts.isCallExpression(node) && ['alert', 'confirm'].includes(node.expression.getText(source))) node.arguments.forEach(textExpression);
    ts.forEachChild(node, visit);
  };
  visit(source);
}
await mkdir('.tmp/i18n', { recursive: true });
await writeFile('.tmp/i18n/product-text.json', JSON.stringify(Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b))), null, 2));
console.log(`${found.size} product text candidates in ${files.length} files; inspect .tmp/i18n/product-text.json before translating.`);
