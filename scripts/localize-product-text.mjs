#!/usr/bin/env node
// Apply only reviewed, typed catalog keys to product JSX. Never rewrite prompts or model data.
import ts from 'typescript';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const catalog = ts.createSourceFile('catalog.ts', await readFile('apps/web/src/i18n/catalog.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const keys = new Set();
const gather = node => { if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) keys.add(node.name.text); ts.forEachChild(node, gather); };
gather(catalog);
const files = execFileSync('rg',['--files','apps/web/src'],{encoding:'utf8'}).trim().split('\n').filter(file=>file.endsWith('.tsx'));
let converted = 0;
for (const file of files) {
  const text = await readFile(file,'utf8');
  const source = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const edits = [];
  const add = (node, replacement) => { edits.push([node.getStart(source),node.end,replacement]); converted++; };
  const textExpression = node => {
    if (!node) return;
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && keys.has(node.text)) add(node,`translate(${JSON.stringify(node.text)})`);
    else if (ts.isConditionalExpression(node)) { textExpression(node.whenTrue); textExpression(node.whenFalse); }
    else if (ts.isParenthesizedExpression(node)) textExpression(node.expression);
    else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) textExpression(node.right);
  };
  const visit = node => {
    if (ts.isJsxText(node)) {
      const key=node.text.replace(/\s+/g,' ').trim();
      if(keys.has(key)) {
        const raw=node.text;
        const lines = raw.replace(/\t/g, ' ').split(/\r\n|\n|\r/);
        const last = lines.findLastIndex(line => /[^ ]/.test(line));
        const cleaned = lines.map((line, index) => (index ? line.replace(/^ +/, '') : line)
          .replace(index < lines.length - 1 ? / +$/ : /$^/, '') + (index < last && line.trim() ? ' ' : '')).join('');
        const before = /^ /.test(cleaned) ? '{" "}' : '';
        const after = / $/.test(cleaned) ? '{" "}' : '';
        edits.push([node.pos,node.end,`${before}{translate(${JSON.stringify(key)})}${after}`]); converted++;
      }
    }
    if(ts.isJsxAttribute(node)&&['title','aria-label','placeholder','alt','label','description','subtitle','heading','tooltip','helperText','emptyMessage','sectionName'].includes(node.name.getText(source))&&node.initializer) {
      if(ts.isStringLiteral(node.initializer)&&keys.has(node.initializer.text)) add(node.initializer,`{translate(${JSON.stringify(node.initializer.text)})}`);
      else if(ts.isJsxExpression(node.initializer)) textExpression(node.initializer.expression);
    }
    if(ts.isJsxExpression(node)&&(ts.isJsxElement(node.parent)||ts.isJsxFragment(node.parent))) textExpression(node.expression);
    ts.forEachChild(node,visit);
  };
  visit(source);
  if(!edits.length) continue;
  const hasLocaleImport=/import\s*\{[^}]*\buseLocale\b[^}]*\}\s*from\s*['"][^'"]*i18n['"]/.test(text);
  const hasTranslateImport=/import\s*\{[^}]*\btranslate\b[^}]*\}\s*from\s*['"][^'"]*i18n['"]/.test(text);
  const subscribeComponents = node => {
    if(ts.isFunctionDeclaration(node)&&node.name&&/^[A-Z]/.test(node.name.text)&&node.body&&!node.body.statements.some(statement=>statement.getText(source).startsWith('useLocale('))) {
      edits.push([node.body.getStart(source)+1,node.body.getStart(source)+1,'\n  useLocale();']);
    }
    ts.forEachChild(node,subscribeComponents);
  };
  subscribeComponents(source);
  const imports=[];
  if(!hasLocaleImport) imports.push('useLocale');
  if(!hasTranslateImport) imports.push('translate');
  const relative=path.relative(path.dirname(file),'apps/web/src/i18n').replaceAll(path.sep,'/');
  if(imports.length) edits.push([0,0,`import { ${imports.join(', ')} } from '${relative.startsWith('.')?relative:`./${relative}`}';\n`]);
  edits.sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
  let result=text;
  for(const [start,end,replacement] of edits) result=result.slice(0,start)+replacement+result.slice(end);
  await writeFile(file,result);
}
console.log(`Localized ${converted} reviewed product text occurrences.`);
