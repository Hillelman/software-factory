// Suggests format/lint/typecheck/test/e2e/dev commands from the project's manifest files.
// These are only suggestions: the orchestrator confirms them with the user and the steps
// run whatever ends up in .factory/config.json, so any language works.
import fs from 'node:fs';
import path from 'node:path';

const exists = (root, file) => fs.existsSync(path.join(root, file));

function nodeCommands(root) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  const pm = exists(root, 'pnpm-lock.yaml') ? 'pnpm' : exists(root, 'yarn.lock') ? 'yarn' : exists(root, 'bun.lockb') || exists(root, 'bun.lock') ? 'bun' : 'npm';
  const scripts = pkg.scripts ?? {};
  const pick = (...names) => {
    const name = names.find((n) => scripts[n]);
    return name ? `${pm} run ${name}` : null;
  };
  return {
    ecosystem: `node (${pm})`,
    format: pick('format', 'fmt', 'prettier'),
    lint: pick('lint', 'eslint'),
    typecheck: pick('typecheck', 'type-check', 'tsc', 'check-types'),
    test: pick('test', 'test:unit'),
    e2e: pick('e2e', 'test:e2e', 'playwright'),
    dev: pick('dev', 'start', 'serve'),
  };
}

const ECOSYSTEMS = [
  {
    files: ['pyproject.toml', 'requirements.txt', 'setup.py'],
    ecosystem: 'python',
    format: 'ruff format .',
    lint: 'ruff check --fix .',
    typecheck: 'mypy .',
    test: 'pytest',
  },
  { files: ['go.mod'], ecosystem: 'go', format: 'gofmt -w .', lint: 'go vet ./...', typecheck: 'go build ./...', test: 'go test ./...' },
  {
    files: ['Cargo.toml'],
    ecosystem: 'rust',
    format: 'cargo fmt',
    lint: 'cargo clippy --fix --allow-dirty -- -D warnings',
    typecheck: 'cargo check',
    test: 'cargo test',
  },
  { files: ['pom.xml'], ecosystem: 'java (maven)', format: null, lint: 'mvn -q verify -DskipTests', typecheck: 'mvn -q compile', test: 'mvn -q test' },
  { files: ['build.gradle', 'build.gradle.kts'], ecosystem: 'jvm (gradle)', format: null, lint: './gradlew check -x test', typecheck: './gradlew compileJava', test: './gradlew test' },
  { files: ['Gemfile'], ecosystem: 'ruby', format: 'bundle exec rubocop -a', lint: 'bundle exec rubocop', typecheck: null, test: 'bundle exec rake test' },
  { files: ['composer.json'], ecosystem: 'php', format: null, lint: 'vendor/bin/phpstan analyse', typecheck: null, test: 'vendor/bin/phpunit' },
  { files: ['mix.exs'], ecosystem: 'elixir', format: 'mix format', lint: 'mix credo', typecheck: 'mix compile --warnings-as-errors', test: 'mix test' },
  { files: ['Package.swift'], ecosystem: 'swift', format: null, lint: null, typecheck: 'swift build', test: 'swift test' },
];

export function detectCommands(root) {
  const found = [];
  const node = nodeCommands(root);
  if (node) found.push(node);
  for (const { files, ...commands } of ECOSYSTEMS) {
    if (files.some((f) => exists(root, f))) found.push({ e2e: null, dev: null, ...commands });
  }
  if (fs.readdirSync(root).some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) {
    found.push({ ecosystem: 'dotnet', format: 'dotnet format', lint: null, typecheck: 'dotnet build', test: 'dotnet test', e2e: null, dev: null });
  }
  const taskRunners = ['Makefile', 'justfile', 'Taskfile.yml'].filter((f) => exists(root, f));
  const ci = ['.github/workflows', '.gitlab-ci.yml', '.circleci'].filter((f) => exists(root, f));
  return { ecosystems: found, taskRunners, ci, suggested: found[0] ?? null };
}
