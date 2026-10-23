import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const staticDomainLabels = new Set([
  'SITE MAPPER',
  'APPMANAGER',
  'BDFB',
  'JSON',
  'English',
  'Español',
  'A + B',
  'V · V',
  'I · A',
  'P · W',
  'E · kWh',
  '⌘ K',
]);

const technicalExamples = new Set([
  'operator@company.com',
  'RJ45, SFP+, terminal...',
  'Ethernet, Modbus, RS-485...',
  'BDFB-01',
  'BDFB Panel 24P',
  'Cisco',
  'C9300-48P',
]);

function uiFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? uiFiles(path) : entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function allowedStaticText(value: string, attribute: boolean): boolean {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || !/[a-zA-ZÀ-ÿ]/u.test(text)) return true;
  if (staticDomainLabels.has(text)) return true;
  if (attribute && technicalExamples.has(text)) return true;
  return false;
}

describe('Bilingual presentation static-source coverage', () => {
  it('extracts human-facing literal JSX text and accessibility/placeholder attributes', () => {
    const root = resolve(process.cwd(), 'src');
    const issues: string[] = [];
    const files = uiFiles(root);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const ast = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function record(node: ts.Node, value: string, attribute = false) {
        if (allowedStaticText(value, attribute)) return;
        const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
        issues.push(`${relative(root, file)}:${line}: ${JSON.stringify(value.trim())}`);
      }
      function visit(node: ts.Node) {
        if (ts.isJsxText(node)) record(node, node.text);
        if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
          if (
            ['placeholder', 'title', 'alt', 'aria-label', 'aria-description'].includes(
              node.name.getText(ast),
            )
          ) {
            record(node, node.initializer.text, true);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
    expect(files.length).toBeGreaterThanOrEqual(82);
    expect(issues).toEqual([]);
  });
});
