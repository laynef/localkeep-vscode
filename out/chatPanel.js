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
exports.ChatPanel = void 0;
const vscode = __importStar(require("vscode"));
const lkClient_1 = require("./lkClient");
class ChatPanel {
    static createOrShow(extensionUri) {
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        const panel = vscode.window.createWebviewPanel('sage-chat', 'Sage Chat', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
    }
    constructor(panel, _extensionUri) {
        this._history = [];
        this._disposables = [];
        this._panel = panel;
        this._panel.webview.html = this._getHtml();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'send')
                await this._handleSend(msg.text);
            if (msg.type === 'clear') {
                this._history = [];
                this._post({ type: 'history', messages: [] });
            }
        }, null, this._disposables);
    }
    async _handleSend(text) {
        this._history.push({ role: 'user', content: text });
        this._post({ type: 'history', messages: this._history });
        const model = (0, lkClient_1.readDefaultModel)();
        let reply = '';
        this._post({ type: 'streaming_start', model });
        try {
            await (0, lkClient_1.streamChat)(this._history, model, (token) => {
                reply += token;
                this._post({ type: 'token', token });
            });
        }
        catch (e) {
            reply = `Error: ${e.message}`;
        }
        this._history.push({ role: 'assistant', content: reply });
        this._post({ type: 'streaming_end' });
    }
    _post(msg) { this._panel.webview.postMessage(msg); }
    _getHtml() {
        // All dynamic content is rendered via textContent (never innerHTML) to prevent XSS
        return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body{font-family:var(--vscode-font-family);padding:0;margin:0;display:flex;flex-direction:column;height:100vh}
  #messages{flex:1;overflow-y:auto;padding:12px}
  .msg{margin:8px 0;padding:8px 12px;border-radius:8px;max-width:90%}
  .user{background:var(--vscode-inputOption-activeBackground);margin-left:auto;text-align:right}
  .assistant{background:var(--vscode-editor-inactiveSelectionBackground)}
  .assistant .text{white-space:pre-wrap;word-break:break-word;font-family:var(--vscode-editor-font-family)}
  #input-row{display:flex;padding:8px;gap:8px;border-top:1px solid var(--vscode-editorGroup-border)}
  #input{flex:1;padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;resize:vertical}
  button{padding:6px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;cursor:pointer}
  #badge{font-size:11px;color:var(--vscode-descriptionForeground);padding:4px 12px}
</style>
</head><body>
<div id="badge">Sage Chat</div>
<div id="messages"></div>
<div id="input-row">
  <textarea id="input" rows="2" placeholder="Ask Sage anything..."></textarea>
  <div style="display:flex;flex-direction:column;gap:4px">
    <button id="send-btn">Send</button>
    <button id="clear-btn">Clear</button>
  </div>
</div>
<script>
const vscode = acquireVsCodeApi();
const msgsEl = document.getElementById('messages');
const inp = document.getElementById('input');
const badge = document.getElementById('badge');
document.getElementById('send-btn').addEventListener('click', sendMsg);
document.getElementById('clear-btn').addEventListener('click', () => vscode.postMessage({type:'clear'}));
inp.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();} });

let streaming = false, streamSpan = null;

function sendMsg() {
  const text = inp.value.trim();
  if (!text || streaming) return;
  inp.value = '';
  vscode.postMessage({type:'send', text});
}

function renderMessages(msgs) {
  msgsEl.textContent = '';
  msgs.forEach(m => addMsg(m.role, m.content));
}

function addMsg(role, content) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  const span = document.createElement(role==='assistant' ? 'span' : 'span');
  span.className = 'text';
  span.textContent = content;
  wrap.appendChild(span);
  msgsEl.appendChild(wrap);
  msgsEl.scrollTop = msgsEl.scrollHeight;
  return span;
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type==='history') renderMessages(msg.messages);
  if (msg.type==='streaming_start') {
    streaming = true;
    badge.textContent = '⟡ ' + (msg.model||'Sage') + '...';
    streamSpan = addMsg('assistant', '');
  }
  if (msg.type==='token' && streamSpan) {
    streamSpan.textContent += msg.token;
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  if (msg.type==='streaming_end') {
    streaming = false; streamSpan = null;
    badge.textContent = 'Sage Chat';
  }
});
</script></body></html>`;
    }
    dispose() {
        ChatPanel.currentPanel = undefined;
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
exports.ChatPanel = ChatPanel;
