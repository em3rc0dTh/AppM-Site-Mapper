import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Keep the primary MVP navigation usable without importing optional linters.
const entrypoints = [
  'README.md',
  'docs/README.md',
  'docs/architecture/system-map.md',
  'docs/product/MVP-DEMO-ES.md',
  'docs/operations/quickstart.md',
  'docs/operations/history-connectivity.md',
  'docs/release/MVP-READINESS.md',
];
const errors = [];
let inspected = 0;
for (const document of entrypoints) {
  const markdown = readFileSync(document, 'utf8');
  // Markdown plain links; ignore media, external protocols and anchor-only links.
  const links = markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g);
  for (const [, target] of links) {
    if (/^(https?:|mailto:|#|\/)/i.test(target)) continue;
    const decoded = decodeURIComponent(target.split('#', 1)[0]);
    if (!decoded) continue;
    inspected++;
    const resolved = path.resolve(path.dirname(document), decoded);
    if (!existsSync(resolved) || !statSync(resolved).isFile() && !statSync(resolved).isDirectory()) {
      errors.push(`${document}: missing ${target}`);
    }
  }
}
if (errors.length) {
  for (const issue of errors) console.error('DOCS_LINK_ERROR', issue);
  process.exitCode = 1;
} else {
  console.log(`DOCS_LINK_PASS: ${entrypoints.length} entrypoints, ${inspected} relative links`);
}
