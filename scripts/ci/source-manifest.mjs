import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const paths = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0')
  .filter(p => /^(backend\/|frontend\/|mobile-scanner\/|services\/|contracts\/|scripts\/|infra\/|\.github\/|compose\.yaml$)/.test(p))
  .filter(p => !p.split('/').some(part => ['node_modules', 'dist', 'target', '.expo', '.vite'].includes(part)))
  .filter(p => existsSync(path.join(root, p)))
  .sort();
const hash = createHash('sha256');
for (const p of paths) {
  let bytes = readFileSync(path.join(root, p));
  // Git checkouts may use CRLF locally and LF on CI. Binary assets are hashed verbatim.
  if (/\.(java|xml|json|[cm]?js|jsx|ts|tsx|css|html|ya?ml|sql|properties|ps1|sh|md|svg)$/.test(p) || /Dockerfile|mvnw$/.test(p)) {
    bytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
  }
  hash.update(p); hash.update('\0'); hash.update(bytes); hash.update('\0');
}
process.stdout.write(JSON.stringify({
  commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'),
  dirty: git('status', '--porcelain').split('\n').filter(Boolean),
  sourceSha256: hash.digest('hex'), sourceFileCount: paths.length,
  node: process.version, platform: process.platform,
}, null, 2));
