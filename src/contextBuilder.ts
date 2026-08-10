import * as vscode from 'vscode';
import * as path from 'path';

export interface CodeContext {
  filePath: string;
  relPath: string;
  language: string;
  selection: string;
  prefix: string;
  suffix: string;
  workspaceRoot: string;
}

export function buildContext(editor: vscode.TextEditor): CodeContext {
  const doc = editor.document;
  const sel = editor.selection;
  const cfg = vscode.workspace.getConfiguration('lk');
  const contextLines = cfg.get<number>('contextLines') ?? 50;

  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(doc.uri.fsPath);
  const relPath = path.relative(wsRoot, doc.uri.fsPath);
  const selected = doc.getText(sel.isEmpty ? undefined : sel);
  const startLine = Math.max(0, sel.start.line - contextLines);
  const endLine   = Math.min(doc.lineCount - 1, sel.end.line + Math.floor(contextLines / 2));
  const prefix = doc.getText(new vscode.Range(startLine, 0, sel.start.line, sel.start.character));
  const suffix = doc.getText(new vscode.Range(sel.end.line, sel.end.character, endLine, 0));

  return {
    filePath: doc.uri.fsPath,
    relPath,
    language: doc.languageId,
    selection: selected,
    prefix,
    suffix,
    workspaceRoot: wsRoot,
  };
}

export function buildPrompt(ctx: CodeContext, action: string): string {
  const parts: string[] = [
    `Language: ${ctx.language}`,
    `File: ${ctx.relPath}`,
  ];
  if (ctx.prefix) parts.push(`\`\`\`\n${ctx.prefix}`);
  if (ctx.selection) parts.push(`--- SELECTION START ---\n${ctx.selection}\n--- SELECTION END ---`);
  if (ctx.suffix) parts.push(`${ctx.suffix}\n\`\`\``);
  parts.push(`\nTask: ${action}`);
  return parts.join('\n');
}
