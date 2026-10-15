// Turns dist/index.html into a page fragment for hosts that supply their own
// <!doctype>, <html>, <head> and <body> (e.g. a claude.ai artifact). Output: dist/artifact.html
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';

const headKeep = head
  .split('\n')
  .filter(l => !/<meta\s+charset/i.test(l) && !/<meta\s+name="viewport"/i.test(l))
  .join('\n')
  .trim();

// module scripts must run after the markup exists, so the script goes last
const scripts = [];
const headNoScripts = headKeep.replace(/<script[\s\S]*?<\/script>\s*/gi, m => { scripts.push(m.trim()); return ''; });

// tells the claude.ai host that the side gutters already respect the safe-area insets
const hostMeta = '<meta name="claude:viewport-fit-sides" content="cover">';
const page = headNoScripts.replace(/(<title>[\s\S]*?<\/title>)/i, `$1\n${hostMeta}`);
writeFileSync('dist/artifact.html', `${page}\n${body.trim()}\n${scripts.join('\n')}\n`);
console.log('wrote dist/artifact.html');
