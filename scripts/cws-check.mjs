#!/usr/bin/env node
/**
 * Chrome Web Store pre-submission gate. Fails (exit 1) on any blocker.
 *
 * Checks: manifest limits, referenced files, icon sizes, remote/dynamic code,
 * CSP strictness, permission least-privilege (with dashboard justifications),
 * hard-coded secrets, privacy policy Limited Use statement, package layout.
 *
 * Usage: node scripts/cws-check.mjs [path/to/package.zip]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listZipEntries } from './zip-list.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = process.argv[2];
const results = [];
/** @param {boolean} ok @param {string} name @param {string} [detail] */
const check = (ok, name, detail = '') => results.push({ ok, name, detail });

/** Permissions allowed for this extension + the justification to paste in the CWS dashboard. */
const PERMISSION_JUSTIFICATIONS = {
  tabs: 'Leer título y URL de las pestañas para decidir su grupo (función única de la extensión).',
  tabGroups: 'Crear, nombrar y colorear grupos de pestañas.',
  storage: 'Guardar preferencias del usuario, política gestionada por TI y estado de sesión.',
};
const OPTIONAL_JUSTIFICATIONS = {
  nativeMessaging: 'Opcional, solicitado solo si el usuario activa el puente con Claude Desktop: comunica la extensión con el host local instalado por el usuario (allowed_origins restringido a esta extensión).',
};
const HOST_JUSTIFICATIONS = {
  'https://api.anthropic.com/*': 'Enviar título/dominio redactados al modelo Claude del usuario (BYOK) para clasificar pestañas, solo con consentimiento explícito.',
};
const FORBIDDEN_PERMISSIONS = ['<all_urls>', 'webRequest', 'webRequestBlocking', 'debugger', 'cookies', 'history', 'scripting', 'nativeMessaging', 'management', 'proxy', 'declarativeNetRequestWithHostAccess'];

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

// ---- Manifest limits ----
check(manifest.manifest_version === 3, 'manifest_version 3');
check(manifest.name?.length > 0 && manifest.name.length <= 75, 'name ≤ 75 chars', `${manifest.name?.length}`);
check(manifest.description?.length > 0 && manifest.description.length <= 132, 'description ≤ 132 chars', `${manifest.description?.length}`);
check(/^\d{1,5}(\.\d{1,5}){0,3}$/.test(manifest.version) && manifest.version.split('.').every((n) => Number(n) <= 65535), 'version format', manifest.version);

// ---- Referenced files exist ----
const referenced = [
  manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_page,
  manifest.storage?.managed_schema,
  ...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean);
const missing = referenced.filter((p) => !existsSync(join(ROOT, p)));
check(missing.length === 0, 'manifest files exist', missing.join(', '));

// ---- Icons: 128 required, PNG dimensions match declared size ----
check(Boolean(manifest.icons?.['128']), 'icon 128 declared');
for (const [size, p] of Object.entries(manifest.icons ?? {})) {
  const buf = readFileSync(join(ROOT, p));
  const isPng = buf.subarray(1, 4).toString() === 'PNG';
  const w = isPng ? buf.readUInt32BE(16) : 0;
  const h = isPng ? buf.readUInt32BE(20) : 0;
  check(isPng && w === Number(size) && h === Number(size), `icon ${size} is ${size}x${size} PNG`, `${w}x${h}`);
}

// ---- Managed schema ----
try {
  const schema = JSON.parse(read(manifest.storage.managed_schema));
  check(schema.type === 'object' && typeof schema.properties === 'object', 'managed_schema valid');
} catch (e) {
  check(false, 'managed_schema valid', e.message);
}

// ---- Source scan ----
/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
  const p = join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
const srcFiles = walk('src');
const js = srcFiles.filter((f) => f.endsWith('.js'));
const html = srcFiles.filter((f) => f.endsWith('.html'));

const dynamicCode = js.flatMap((f) => {
  const code = read(f);
  return [
    [/\beval\s*\(/, 'eval('], [/\bnew\s+Function\s*\(/, 'new Function('],
    [/setTimeout\s*\(\s*['"`]/, 'setTimeout(string)'], [/setInterval\s*\(\s*['"`]/, 'setInterval(string)'],
    [/importScripts\s*\(/, 'importScripts('], [/import\s*\(\s*['"`]https?:/, 'remote import()'],
    [/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/, 'HTML injection sink'],
  ].filter(([re]) => re.test(code)).map(([, label]) => `${f}: ${label}`);
});
check(dynamicCode.length === 0, 'no remote/dynamic code or HTML sinks (Blue Argon)', dynamicCode.join('; '));

const htmlIssues = html.flatMap((f) => {
  const doc = read(f);
  const issues = [];
  if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(doc)) issues.push('inline <script>');
  if (/<script[^>]+src=["']https?:/i.test(doc)) issues.push('remote script');
  if (/<link[^>]+href=["']https?:/i.test(doc)) issues.push('remote stylesheet');
  if (/\son[a-z]+\s*=/i.test(doc)) issues.push('inline event handler');
  if (/<style[\s>]/i.test(doc) || /\sstyle\s*=/i.test(doc)) issues.push('inline style (breaks style-src self)');
  for (const m of doc.matchAll(/(?:src|href)=["']([^"'#][^"']*)["']/g)) {
    if (!/^[a-z]+:/i.test(m[1]) && !existsSync(join(ROOT, dirname(f), m[1]))) issues.push(`missing ${m[1]}`);
  }
  return issues.map((i) => `${f}: ${i}`);
});
check(htmlIssues.length === 0, 'HTML: no inline/remote code, all assets local', htmlIssues.join('; '));

// ---- CSP ----
const csp = manifest.content_security_policy?.extension_pages ?? '';
const directive = (name) => (csp.match(new RegExp(`${name}\\s+([^;]+)`)) ?? [])[1]?.trim() ?? '';
check(directive('script-src') === "'self'", "CSP script-src 'self' only", directive('script-src'));
check(["'none'", "'self'"].includes(directive('object-src')), 'CSP object-src restricted', directive('object-src'));
check(!/unsafe-(eval|inline)/.test(csp), 'CSP has no unsafe-*');
check(directive('base-uri') === "'none'" && directive('frame-ancestors') === "'none'", 'CSP base-uri/frame-ancestors none');

// ---- Least privilege ----
const perms = manifest.permissions ?? [];
const unjustified = perms.filter((p) => !PERMISSION_JUSTIFICATIONS[p]);
check(unjustified.length === 0, 'permissions all justified (Purple Potassium)', unjustified.join(', '));
const optional = manifest.optional_permissions ?? [];
const unjustifiedOptional = optional.filter((p) => !OPTIONAL_JUSTIFICATIONS[p]);
check(unjustifiedOptional.length === 0, 'optional permissions justified', unjustifiedOptional.join(', '));
const forbidden = [...perms, ...(manifest.host_permissions ?? [])].filter((p) => FORBIDDEN_PERMISSIONS.includes(p) || /^\*:\/\/|^<all_urls>$|^https?:\/\/\*\//.test(p));
check(forbidden.length === 0, 'no broad/forbidden permissions', forbidden.join(', '));
const hosts = manifest.host_permissions ?? [];
check(hosts.every((h) => HOST_JUSTIFICATIONS[h]), 'host_permissions minimal & justified', hosts.join(', '));
check(!manifest.content_scripts && !manifest.web_accessible_resources, 'no content scripts / web-accessible resources');

// ---- Secrets ----
const secretHits = walk('.').filter((f) => !/node_modules|\.git|dist|test[\\/]/.test(f) && /\.(js|mjs|json|html|md|ya?ml)$/.test(f))
  .filter((f) => /sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}/.test(read(f)));
check(secretHits.length === 0, 'no hard-coded secrets', secretHits.join(', '));

// ---- Privacy policy ----
const privacy = existsSync(join(ROOT, 'PRIVACY.md')) ? read('PRIVACY.md') : '';
check(/Chrome Web Store User Data Policy, including the Limited Use requirements/.test(privacy), 'PRIVACY.md has Limited Use statement');

// ---- Package ----
if (zipPath) {
  const listing = listZipEntries(readFileSync(zipPath));
  check(listing.includes('manifest.json'), 'zip: manifest.json at root');
  const junk = listing.filter((f) => /^(test|docs|scripts|bridge|node_modules|\.github)\/|\.map$|package(-lock)?\.json$|\.md$/.test(f));
  check(junk.length === 0, 'zip: no dev/test files', junk.slice(0, 5).join(', '));
  const kb = Math.round(statSync(zipPath).size / 1024);
  check(kb < 10 * 1024, 'zip size sane', `${kb} KB`);
  const needed = [...referenced, ...srcFiles.map((f) => relative(ROOT, join(ROOT, f)).replaceAll('\\', '/'))];
  const notPacked = needed.filter((f) => !listing.includes(f));
  check(notPacked.length === 0, 'zip: contains all runtime files', notPacked.join(', '));
}

// ---- Report ----
const pad = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.ok ? '' : r.detail}`);
console.log('\nJustificaciones para el dashboard de CWS:');
for (const p of perms) console.log(`  - ${p}: ${PERMISSION_JUSTIFICATIONS[p] ?? '??'}`);
for (const h of hosts) console.log(`  - ${h}: ${HOST_JUSTIFICATIONS[h] ?? '??'}`);
for (const o of optional) console.log(`  - ${o} (opcional): ${OPTIONAL_JUSTIFICATIONS[o] ?? '??'}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

