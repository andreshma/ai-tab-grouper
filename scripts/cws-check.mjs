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
  tabs: 'Read the title and URL of tabs to decide their group (the extension\'s single purpose).',
  tabGroups: 'Create, name and color tab groups.',
  storage: 'Store user preferences, IT-managed policy and session state.',
};
const OPTIONAL_JUSTIFICATIONS = {
  nativeMessaging: 'Optional, requested only if the user enables the Claude Desktop bridge: it connects the extension to the local host installed by the user (allowed_origins restricted to this extension).',
};
const HOST_JUSTIFICATIONS = {
  'https://api.anthropic.com/*': 'Send the redacted title/domain to the user\'s Claude model (BYOK) to classify tabs, only with explicit consent.',
};
const FORBIDDEN_PERMISSIONS = ['<all_urls>', 'webRequest', 'webRequestBlocking', 'debugger', 'cookies', 'history', 'scripting', 'nativeMessaging', 'management', 'proxy', 'declarativeNetRequestWithHostAccess'];

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

// ---- Manifest limits ----
check(manifest.manifest_version === 3, 'manifest_version 3');

// ---- Locales: every __MSG_*__ in the manifest resolves in every locale; store limits hold per locale ----
const MSG_REF = /__MSG_([A-Za-z0-9_@]+)__/g;
const localeDir = join(ROOT, '_locales');
const locales = existsSync(localeDir) ? readdirSync(localeDir).sort() : [];
const usesMessages = MSG_REF.test(JSON.stringify(manifest));
check(!usesMessages || locales.includes(manifest.default_locale), 'default_locale has a _locales catalogue', `${manifest.default_locale}`);
check(usesMessages || !manifest.default_locale, 'default_locale only with localized manifest');
/** @param {string} locale @param {unknown} value @returns {string} `value` with its __MSG_*__ references expanded ('' if one is missing). */
const localized = (locale, value) => {
  const messages = JSON.parse(read(join('_locales', locale, 'messages.json')));
  let ok = true;
  const text = String(value ?? '').replace(MSG_REF, (_, key) => {
    const entry = Object.entries(messages).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
    if (!entry?.message) ok = false;
    return entry?.message ?? '';
  });
  return ok ? text : '';
};
for (const locale of usesMessages ? locales : ['']) {
  const [name, description] = locale
    ? [localized(locale, manifest.name), localized(locale, manifest.description)]
    : [manifest.name ?? '', manifest.description ?? ''];
  const tag = locale ? ` [${locale}]` : '';
  check(name.length > 0 && name.length <= 75, `name ≤ 75 chars${tag}`, `${name.length}`);
  check(description.length > 0 && description.length <= 132, `description ≤ 132 chars${tag}`, `${description.length}`);
  if (locale) {
    const unresolved = [...JSON.stringify(manifest).matchAll(MSG_REF)].map((m) => m[0]).filter((ref) => !localized(locale, ref));
    check(unresolved.length === 0, `manifest messages resolve${tag}`, unresolved.join(', '));
  }
}
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
  const junk = listing.filter((f) => /^(test|docs|scripts|bridge|node_modules|\.github)\/|\.map$|package(-lock)?\.json$|\.md$|\.cff$/.test(f));
  check(junk.length === 0, 'zip: no dev/test files', junk.slice(0, 5).join(', '));
  const kb = Math.round(statSync(zipPath).size / 1024);
  check(kb < 10 * 1024, 'zip size sane', `${kb} KB`);
  const localeFiles = locales.map((l) => `_locales/${l}/messages.json`);
  const needed = [...referenced, ...localeFiles, ...srcFiles.map((f) => relative(ROOT, join(ROOT, f)).replaceAll('\\', '/'))];
  const notPacked = needed.filter((f) => !listing.includes(f));
  check(notPacked.length === 0, 'zip: contains all runtime files', notPacked.join(', '));
}

// ---- Report ----
const pad = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.ok ? '' : r.detail}`);
console.log('\nJustifications for the CWS dashboard:');
for (const p of perms) console.log(`  - ${p}: ${PERMISSION_JUSTIFICATIONS[p] ?? '??'}`);
for (const h of hosts) console.log(`  - ${h}: ${HOST_JUSTIFICATIONS[h] ?? '??'}`);
for (const o of optional) console.log(`  - ${o} (optional): ${OPTIONAL_JUSTIFICATIONS[o] ?? '??'}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

