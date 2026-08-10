import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// Absolute fallbacks, tried only after a real PATH search. These are the
// common pip/pipx/homebrew install locations; they are deliberately NOT the
// primary lookup, because most installs land somewhere else entirely
// (conda envs, virtualenvs, asdf, /usr/bin, Scoop, ...).
const CANDIDATE_PATHS = [
  path.join(os.homedir(), '.local', 'bin', 'lk'),
  path.join(os.homedir(), '.local', 'bin', 'sage'),
  path.join(os.homedir(), '.pyenv', 'shims', 'lk'),
  path.join(os.homedir(), '.pyenv', 'shims', 'sage'),
  '/opt/homebrew/bin/sage',
  '/usr/local/bin/sage',
  path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Scripts', 'lk.exe'),
];

export interface Auth { id_token: string; tier?: string; }

function isExecutableFile(p: string): boolean {
  try {
    if (!fs.statSync(p).isFile()) { return false; }
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve an executable by searching $PATH, the way a shell does.
 *
 * This exists because `fs.accessSync('sage', X_OK)` does NOT search PATH — it
 * resolves 'sage' relative to the current working directory. Relying on that
 * made the extension report "sage binary not found" on any machine where sage
 * was installed on PATH but outside the hardcoded CANDIDATE_PATHS list (conda,
 * virtualenv, asdf, Scoop, distro packages, ...).
 */
export function resolveOnPath(command: string): string | null {
  const rawPath = process.env.PATH;
  if (!rawPath) { return null; }
  // On Windows an executable needs one of the PATHEXT suffixes appended.
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (const dir of rawPath.split(path.delimiter)) {
    if (!dir) { continue; }
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (isExecutableFile(candidate)) { return candidate; }
    }
  }
  return null;
}

export function findSageBinary(): string {
  // `lk` is THE Local Keep AI command; `sage` remains as the CLI's own
  // compatibility alias for older installs.
  const onPath = resolveOnPath('lk') || resolveOnPath('sage');
  if (onPath) { return onPath; }
  for (const p of CANDIDATE_PATHS) {
    if (isExecutableFile(p)) { return p; }
  }
  throw new Error(
    'sage binary not found. Install with: pip install local-keep-ai-cli\n' +
    'Then run: sage login'
  );
}

export function readAuth(): Auth | null {
  const p = path.join(os.homedir(), '.sage', 'auth.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export function readDefaultModel(): string {
  const cfg = vscode.workspace.getConfiguration('lk');
  if (cfg.get<string>('model')) return cfg.get<string>('model')!;
  try {
    const p = path.join(os.homedir(), '.sage', 'config.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data.default_model || 'cloud:qwen3-coder';
  } catch { return 'cloud:qwen3-coder'; }
}

export function runCommand(
  args: string[],
  cwd: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve, reject) => {
    const bin = findSageBinary();
    const env = { ...process.env, NO_COLOR: '1', TERM: 'dumb' };
    const proc = cp.spawn(bin, args, { cwd, env, shell: false });
    if (signal) signal.addEventListener('abort', () => proc.kill());
    proc.stdout.on('data', (d: Buffer) => onChunk(d.toString()));
    proc.stderr.on('data', (d: Buffer) => onChunk(d.toString()));
    proc.on('close', resolve);
    proc.on('error', reject);
  });
}

export async function listModels(): Promise<string[]> {
  const bin = findSageBinary();
  const out = await new Promise<string>((res, rej) => {
    cp.execFile(bin, ['models', '--all'], { env: { ...process.env, NO_COLOR: '1' } },
      (err, stdout) => err ? rej(err) : res(stdout));
  });
  return out.split('\n')
    .map(l => l.trim().split(/\s+/)[0])
    .filter(id => /^(cloud:|openrouter:|ollama:|llama_cpp:|gemini:)/.test(id));
}

export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  model: string,
  onToken: (t: string) => void
): Promise<void> {
  const auth = readAuth();
  if (!auth?.id_token) throw new Error('Not logged in. Run: sage login');
  const apiBase = vscode.workspace.getConfiguration('lk').get<string>('apiBase') || 'https://localkeep.ai';
  const res = await fetch(`${apiBase}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.id_token}` },
    body: JSON.stringify({ model_id: model, messages, stream: true, max_tokens: 4096 }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const chunk = line.slice(5).trim();
      if (!chunk || chunk === '[DONE]') continue;
      try {
        const p = JSON.parse(chunk);
        if (p.token) onToken(p.token);
        else if (p.done) return;
      } catch { /* non-JSON chunk */ }
    }
  }
}
