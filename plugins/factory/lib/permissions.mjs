import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FactoryError } from './state.mjs';

export const COMMANDS = ['gh pr create', 'gh pr merge'];
export const ALLOW_RULES = ['Bash(gh pr create:*)', 'Bash(gh pr merge:*)'];

function readSettings(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new FactoryError(`Invalid JSON in ${file}: ${err.message}`);
  }
}

// Returns true when a permission rule such as "Bash(gh pr:*)" or "Bash(gh *)" covers the command.
function ruleMatches(rule, command) {
  if (rule === 'Bash' || rule === 'Bash(*)') return true;
  const m = /^Bash\((.*)\)$/s.exec(rule);
  if (!m) return false;
  const pattern = m[1].trim();
  if (pattern === '*') return true;
  const prefix = pattern.endsWith(':*') ? pattern.slice(0, -2) : pattern.endsWith(' *') ? pattern.slice(0, -2) : null;
  if (prefix === null) return pattern === command;
  return command === prefix || command.startsWith(`${prefix} `);
}

function settingsFiles(home, project) {
  return [
    { scope: 'user', file: path.join(home, '.claude', 'settings.json') },
    { scope: 'project', file: path.join(project, '.claude', 'settings.json') },
    { scope: 'local', file: path.join(project, '.claude', 'settings.local.json') },
  ];
}

function bashHooks(settings, file) {
  const entries = settings?.hooks?.PreToolUse;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => {
      const matcher = typeof e?.matcher === 'string' ? e.matcher : '';
      return matcher === '' || matcher === '*' || /\bBash\b/.test(matcher);
    })
    .map((e) => ({
      file,
      matcher: e.matcher ?? '',
      commands: (Array.isArray(e.hooks) ? e.hooks : []).map((h) => h?.command ?? h?.url ?? h?.type ?? '').filter(Boolean),
    }));
}

export function checkPermissions({ home = os.homedir(), project = process.cwd() } = {}) {
  const loaded = settingsFiles(home, project).map((s) => ({ ...s, settings: readSettings(s.file) }));
  const hooks = loaded.flatMap((s) => bashHooks(s.settings, s.file));
  const commands = COMMANDS.map((command) => {
    const find = (kind) => {
      for (const { file, settings } of loaded) {
        const rules = settings?.permissions?.[kind];
        const rule = Array.isArray(rules) ? rules.find((r) => typeof r === 'string' && ruleMatches(r, command)) : undefined;
        if (rule) return { rule, file };
      }
      return null;
    };
    const deny = find('deny');
    if (deny) return { command, status: 'denied', ...deny };
    const ask = find('ask');
    if (ask) return { command, status: 'prompt', ...ask };
    const allow = find('allow');
    if (allow) return { command, status: 'allowed', ...allow };
    return { command, status: 'prompt', rule: null, file: null };
  });
  return { commands, hooks };
}

function timestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function allowPermissions({ home = os.homedir(), project = process.cwd() } = {}) {
  const file = path.join(home, '.claude', 'settings.json');
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const settings = readSettings(file) ?? {};
  if (typeof settings !== 'object' || Array.isArray(settings)) throw new FactoryError(`${file} must contain a JSON object.`);
  if (settings.permissions !== undefined && (settings.permissions === null || typeof settings.permissions !== 'object')) throw new FactoryError(`"permissions" in ${file} must be an object.`);
  if (settings.permissions?.allow !== undefined && !Array.isArray(settings.permissions.allow)) throw new FactoryError(`"permissions.allow" in ${file} must be an array.`);

  const warnings = [];
  const after = checkPermissions({ home, project });
  for (const c of after.commands) {
    if (c.status === 'denied') warnings.push(`"${c.command}" is denied by ${c.rule} in ${c.file}; the deny rule takes precedence over the allow rule.`);
  }

  const existing = settings.permissions?.allow ?? [];
  const missing = ALLOW_RULES.filter((rule) => !existing.some((r) => typeof r === 'string' && ruleMatches(r, rule.slice(5, -3).trim())));
  if (!missing.length) return { changed: false, file, backup: null, added: [], warnings };

  let backup = null;
  if (raw !== null) {
    backup = `${file}.bak-${timestamp()}`;
    fs.writeFileSync(backup, raw);
  }
  settings.permissions = { ...settings.permissions, allow: [...existing, ...missing] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return { changed: true, file, backup, added: missing, warnings };
}
