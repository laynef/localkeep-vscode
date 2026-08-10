import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import { findSageBinary, readDefaultModel, runCommand, listModels } from './lkClient';
import { buildContext, buildPrompt } from './contextBuilder';
import { ChatPanel } from './chatPanel';
import { SageStatusBar } from './statusBar';

let statusBar: SageStatusBar;

export function activate(ctx: vscode.ExtensionContext) {
  statusBar = new SageStatusBar(ctx);

  ctx.subscriptions.push(
    vscode.commands.registerTextEditorCommand('lk.explain', async (editor) => {
      const context = buildContext(editor);
      const prompt = buildPrompt(context, 'Explain this code clearly and concisely.');
      await runInPanel(ctx, 'Sage: Explain', prompt, context.workspaceRoot);
    }),

    vscode.commands.registerTextEditorCommand('lk.refactor', async (editor) => {
      const context = buildContext(editor);
      const prompt = buildPrompt(context,
        'Refactor this code for clarity, performance, and best practices. ' +
        'Output the improved code inside a FILE: block so it can be applied directly.');
      await runInPanel(ctx, 'Sage: Refactor', prompt, context.workspaceRoot, true);
    }),

    vscode.commands.registerTextEditorCommand('lk.generateTests', async (editor) => {
      const context = buildContext(editor);
      const prompt = buildPrompt(context,
        'Generate comprehensive unit tests for this file covering happy paths, edge cases, and errors.');
      await runInPanel(ctx, 'Sage: Generate Tests', prompt, context.workspaceRoot, true);
    }),

    vscode.commands.registerTextEditorCommand('lk.fixError', async (editor) => {
      const context = buildContext(editor);
      const diags = vscode.languages.getDiagnostics(editor.document.uri)
        .map(d => `Line ${d.range.start.line + 1}: ${d.message}`)
        .join('\n');
      const prompt = buildPrompt(context,
        `Fix the following errors:\n${diags || 'Fix any issues visible in the selected code.'}`);
      await runInPanel(ctx, 'Sage: Fix Error', prompt, context.workspaceRoot, true);
    }),

    vscode.commands.registerCommand('lk.openChat', () => {
      ChatPanel.createOrShow(ctx.extensionUri);
    }),

    vscode.commands.registerCommand('lk.listModels', async () => {
      let models: string[];
      try { models = await listModels(); }
      catch {
        vscode.window.showErrorMessage('sage not found. Install: pip install local-keep-ai-cli');
        return;
      }
      const current = readDefaultModel();
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
    }),

    vscode.commands.registerCommand('lk.runPrompt', async () => {
      const task = await vscode.window.showInputBox({ prompt: 'Enter task for Sage agent' });
      if (!task) return;
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
      await runInPanel(ctx, 'Sage: Run', task, root, true);
    }),

    vscode.commands.registerCommand('lk.commitMessage', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
      const diff = await new Promise<string>((res) => {
        cp.execFile('git', ['diff', '--staged'], { cwd: root }, (_, out) => res(out || ''));
      });
      if (!diff.trim()) {
        vscode.window.showWarningMessage('No staged changes. Use git add first.');
        return;
      }
      const prompt = `Write a git commit message (conventional commits) for:\n\n${diff}`;
      await runInPanel(ctx, 'Sage: Commit Message', prompt, root);
    }),

    vscode.commands.registerCommand('lk.prDescription', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
      const log = await new Promise<string>(r =>
        cp.execFile('git', ['log', '--oneline', 'origin/main..HEAD'], { cwd: root }, (_, o) => r(o)));
      const branch = await new Promise<string>(r =>
        cp.execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }, (_, o) => r(o.trim())));
      const prompt = `Write a GitHub PR description (## Summary, ## Changes, ## Testing) for branch ${branch}:\n\n${log}`;
      await runInPanel(ctx, 'Sage: PR Description', prompt, root);
    }),
  );
}

async function runInPanel(
  ctx: vscode.ExtensionContext,
  title: string,
  prompt: string,
  cwd: string,
  agentMode = false
) {
  const model = readDefaultModel();
  const panel = vscode.window.createWebviewPanel('sage-result', title, vscode.ViewColumn.Beside, {});
  let output = '';
  panel.webview.html = getLoadingHtml(title, model);

  const args = agentMode
    ? ['run', '--model', model, '--quiet', '--prompt', prompt]
    : ['ask', '--model', model, '--raw', prompt];

  try {
    await runCommand(args, cwd, (chunk) => {
      output += chunk;
      panel.webview.html = getResultHtml(title, output, model);
    });
  } catch (e: any) {
    if (e.message?.includes('not found') || e.code === 'ENOENT') {
      vscode.window.showErrorMessage('sage not found. Install: pip install local-keep-ai-cli');
    }
  }
}

function getLoadingHtml(title: string, model: string) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px">
  <h3>${title}</h3><p>⟡ Running with <code>${model}</code>...</p></body></html>`;
}

function getResultHtml(title: string, content: string, model: string) {
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px">
  <h3>${title} <small style="color:#888">· ${model}</small></h3>
  <pre style="white-space:pre-wrap;word-break:break-word">${escaped}</pre></body></html>`;
}

export function deactivate() { statusBar?.dispose(); }
