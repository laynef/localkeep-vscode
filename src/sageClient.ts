import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const CANDIDATE_PATHS = [
  'sage',
  path.join(os.homedir(), '.local', 'bin', 'sage'),
  path.join(os.homedir(), '.pyenv', 'shims', 'sage'),
  '/opt/homebrew/bin/sage',
  '/usr/local/bin/sage',
  path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Scripts', 'sage.exe'),
];

export interface Auth { id_token: string; tier?: string; }

export function findSageBinary(): string {
  for (const p of CANDIDATE_PATHS) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep trying */ }
  }
  throw new Error(
    'sage binary not found. Install with: pip install sage-ai-cli\n' +
    'Then run: sage login'
  );
}

export function readAuth(): Auth | null {
  const p = path.join(os.homedir(), '.sage', 'auth.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export function readDefaultModel(): string {
  const cfg = vscode.workspace.getConfiguration('sage');
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
  const apiBase = vscode.workspace.getConfiguration('sage').get<string>('apiBase') || 'https://sageworksai.com';
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
