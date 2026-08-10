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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const os = __importStar(require("os"));
const lkClient_1 = require("./lkClient");
const contextBuilder_1 = require("./contextBuilder");
const chatPanel_1 = require("./chatPanel");
const statusBar_1 = require("./statusBar");
let statusBar;
function activate(ctx) {
    statusBar = new statusBar_1.SageStatusBar(ctx);
    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('lk.explain', async (editor) => {
        const context = (0, contextBuilder_1.buildContext)(editor);
        const prompt = (0, contextBuilder_1.buildPrompt)(context, 'Explain this code clearly and concisely.');
        await runInPanel(ctx, 'Sage: Explain', prompt, context.workspaceRoot);
    }), vscode.commands.registerTextEditorCommand('lk.refactor', async (editor) => {
        const context = (0, contextBuilder_1.buildContext)(editor);
        const prompt = (0, contextBuilder_1.buildPrompt)(context, 'Refactor this code for clarity, performance, and best practices. ' +
            'Output the improved code inside a FILE: block so it can be applied directly.');
        await runInPanel(ctx, 'Sage: Refactor', prompt, context.workspaceRoot, true);
    }), vscode.commands.registerTextEditorCommand('lk.generateTests', async (editor) => {
        const context = (0, contextBuilder_1.buildContext)(editor);
        const prompt = (0, contextBuilder_1.buildPrompt)(context, 'Generate comprehensive unit tests for this file covering happy paths, edge cases, and errors.');
        await runInPanel(ctx, 'Sage: Generate Tests', prompt, context.workspaceRoot, true);
    }), vscode.commands.registerTextEditorCommand('lk.fixError', async (editor) => {
        const context = (0, contextBuilder_1.buildContext)(editor);
        const diags = vscode.languages.getDiagnostics(editor.document.uri)
            .map(d => `Line ${d.range.start.line + 1}: ${d.message}`)
            .join('\n');
        const prompt = (0, contextBuilder_1.buildPrompt)(context, `Fix the following errors:\n${diags || 'Fix any issues visible in the selected code.'}`);
        await runInPanel(ctx, 'Sage: Fix Error', prompt, context.workspaceRoot, true);
    }), vscode.commands.registerCommand('lk.openChat', () => {
        chatPanel_1.ChatPanel.createOrShow(ctx.extensionUri);
    }), vscode.commands.registerCommand('lk.listModels', async () => {
        let models;
        try {
            models = await (0, lkClient_1.listModels)();
        }
        catch {
            vscode.window.showErrorMessage('sage not found. Install: pip install local-keep-ai-cli');
            return;
        }
        const current = (0, lkClient_1.readDefaultModel)();
        const items = models.map(id => ({
            label: id,
            description: id === current ? '← current' : '',
            picked: id === current,
        }));
        const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select Local Keep AI model' });
        if (pick) {
            await vscode.workspace.getConfiguration('lk').update('model', pick.label, true);
            statusBar.update(pick.label);
            vscode.window.showInformationMessage(`Sage model: ${pick.label}`);
        }
    }), vscode.commands.registerCommand('lk.runPrompt', async () => {
        const task = await vscode.window.showInputBox({ prompt: 'Enter task for Sage agent' });
        if (!task)
            return;
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
        await runInPanel(ctx, 'Sage: Run', task, root, true);
    }), vscode.commands.registerCommand('lk.commitMessage', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
        const diff = await new Promise((res) => {
            cp.execFile('git', ['diff', '--staged'], { cwd: root }, (_, out) => res(out || ''));
        });
        if (!diff.trim()) {
            vscode.window.showWarningMessage('No staged changes. Use git add first.');
            return;
        }
        const prompt = `Write a git commit message (conventional commits) for:\n\n${diff}`;
        await runInPanel(ctx, 'Sage: Commit Message', prompt, root);
    }), vscode.commands.registerCommand('lk.prDescription', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
        const log = await new Promise(r => cp.execFile('git', ['log', '--oneline', 'origin/main..HEAD'], { cwd: root }, (_, o) => r(o)));
        const branch = await new Promise(r => cp.execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }, (_, o) => r(o.trim())));
        const prompt = `Write a GitHub PR description (## Summary, ## Changes, ## Testing) for branch ${branch}:\n\n${log}`;
        await runInPanel(ctx, 'Sage: PR Description', prompt, root);
    }));
}
async function runInPanel(ctx, title, prompt, cwd, agentMode = false) {
    const model = (0, lkClient_1.readDefaultModel)();
    const panel = vscode.window.createWebviewPanel('sage-result', title, vscode.ViewColumn.Beside, {});
    let output = '';
    panel.webview.html = getLoadingHtml(title, model);
    const args = agentMode
        ? ['run', '--model', model, '--quiet', '--prompt', prompt]
        : ['ask', '--model', model, '--raw', prompt];
    try {
        await (0, lkClient_1.runCommand)(args, cwd, (chunk) => {
            output += chunk;
            panel.webview.html = getResultHtml(title, output, model);
        });
    }
    catch (e) {
        if (e.message?.includes('not found') || e.code === 'ENOENT') {
            vscode.window.showErrorMessage('sage not found. Install: pip install local-keep-ai-cli');
        }
    }
}
function getLoadingHtml(title, model) {
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px">
  <h3>${title}</h3><p>⟡ Running with <code>${model}</code>...</p></body></html>`;
}
function getResultHtml(title, content, model) {
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px">
  <h3>${title} <small style="color:#888">· ${model}</small></h3>
  <pre style="white-space:pre-wrap;word-break:break-word">${escaped}</pre></body></html>`;
}
function deactivate() { statusBar?.dispose(); }
