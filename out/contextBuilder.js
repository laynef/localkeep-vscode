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
exports.buildContext = buildContext;
exports.buildPrompt = buildPrompt;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
function buildContext(editor) {
    const doc = editor.document;
    const sel = editor.selection;
    const cfg = vscode.workspace.getConfiguration('lk');
    const contextLines = cfg.get('contextLines') ?? 50;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(doc.uri.fsPath);
    const relPath = path.relative(wsRoot, doc.uri.fsPath);
    const selected = doc.getText(sel.isEmpty ? undefined : sel);
    const startLine = Math.max(0, sel.start.line - contextLines);
    const endLine = Math.min(doc.lineCount - 1, sel.end.line + Math.floor(contextLines / 2));
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
function buildPrompt(ctx, action) {
    const parts = [
        `Language: ${ctx.language}`,
        `File: ${ctx.relPath}`,
    ];
    if (ctx.prefix)
        parts.push(`\`\`\`\n${ctx.prefix}`);
    if (ctx.selection)
        parts.push(`--- SELECTION START ---\n${ctx.selection}\n--- SELECTION END ---`);
    if (ctx.suffix)
        parts.push(`${ctx.suffix}\n\`\`\``);
    parts.push(`\nTask: ${action}`);
    return parts.join('\n');
}
