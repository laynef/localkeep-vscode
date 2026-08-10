"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOnPath = resolveOnPath;
exports.findSageBinary = findSageBinary;
exports.readAuth = readAuth;
exports.readDefaultModel = readDefaultModel;
exports.runCommand = runCommand;
exports.listModels = listModels;
exports.streamChat = streamChat;
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
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
function isExecutableFile(p) {
    try {
        if (!fs.statSync(p).isFile()) {
            return false;
        }
        fs.accessSync(p, fs.constants.X_OK);
        return true;
    }
    catch {
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
function resolveOnPath(command) {
    const rawPath = process.env.PATH;
    if (!rawPath) {
        return null;
    }
    // On Windows an executable needs one of the PATHEXT suffixes appended.
    const exts = process.platform === 'win32'
        ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
        : [''];
    for (const dir of rawPath.split(path.delimiter)) {
        if (!dir) {
            continue;
        }
        for (const ext of exts) {
            const candidate = path.join(dir, command + ext);
            if (isExecutableFile(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}
function findSageBinary() {
    // `lk` is THE Local Keep AI command; `sage` remains as the CLI's own
    // compatibility alias for older installs.
    const onPath = resolveOnPath('lk') || resolveOnPath('sage');
    if (onPath) {
        return onPath;
    }
    for (const p of CANDIDATE_PATHS) {
        if (isExecutableFile(p)) {
            return p;
        }
    }
    throw new Error('sage binary not found. Install with: pip install local-keep-ai-cli\n' +
        'Then run: sage login');
}
function readAuth() {
    const p = path.join(os.homedir(), '.sage', 'auth.json');
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    catch {
        return null;
    }
}
function readDefaultModel() {
    const cfg = vscode.workspace.getConfiguration('lk');
    if (cfg.get('model'))
        return cfg.get('model');
    try {
        const p = path.join(os.homedir(), '.sage', 'config.json');
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        return data.default_model || 'cloud:qwen3-coder';
    }
    catch {
        return 'cloud:qwen3-coder';
    }
}
function runCommand(args, cwd, onChunk, signal) {
    return new Promise((resolve, reject) => {
        const bin = findSageBinary();
        const env = { ...process.env, NO_COLOR: '1', TERM: 'dumb' };
        const proc = cp.spawn(bin, args, { cwd, env, shell: false });
        if (signal)
            signal.addEventListener('abort', () => proc.kill());
        proc.stdout.on('data', (d) => onChunk(d.toString()));
        proc.stderr.on('data', (d) => onChunk(d.toString()));
        proc.on('close', resolve);
        proc.on('error', reject);
    });
}
async function listModels() {
    const bin = findSageBinary();
    const out = await new Promise((res, rej) => {
        cp.execFile(bin, ['models', '--all'], { env: { ...process.env, NO_COLOR: '1' } }, (err, stdout) => err ? rej(err) : res(stdout));
    });
    return out.split('\n')
        .map(l => l.trim().split(/\s+/)[0])
        .filter(id => /^(cloud:|openrouter:|ollama:|llama_cpp:|gemini:)/.test(id));
}
async function streamChat(messages, model, onToken) {
    const auth = readAuth();
    if (!auth?.id_token)
        throw new Error('Not logged in. Run: sage login');
    const apiBase = vscode.workspace.getConfiguration('lk').get('apiBase') || 'https://localkeep.ai';
    const res = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.id_token}` },
        body: JSON.stringify({ model_id: model, messages, stream: true, max_tokens: 4096 }),
    });
    if (!res.ok)
        throw new Error(`API error ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
            if (!line.startsWith('data:'))
                continue;
            const chunk = line.slice(5).trim();
            if (!chunk || chunk === '[DONE]')
                continue;
            try {
                const p = JSON.parse(chunk);
                if (p.token)
                    onToken(p.token);
                else if (p.done)
                    return;
            }
            catch { /* non-JSON chunk */ }
        }
    }
}
