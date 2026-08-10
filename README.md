<p align="center">
  <img src="https://raw.githubusercontent.com/laynef/localkeep-vscode/main/media/lk-logo.png" width="96" alt="Local Keep AI" />
</p>

# Local Keep AI — VS Code Extension

Local-first AI coding assistant. **1,000+ free models, no API key required** for local models.

## Install

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=localkeepai.local-keep-ai)
(also on [Open VSX](https://open-vsx.org/extension/localkeepai/local-keep-ai-cursor) for Cursor/VSCodium),
search **"Local Keep AI"** in the VS Code Extensions view, or:

```bash
code --install-extension localkeepai.local-keep-ai
```

Then install the CLI: `pip install local-keep-ai-cli && lk login`

## Features

| Feature | Shortcut |
|---|---|
| Open Chat Panel | `Cmd/Ctrl+Shift+S` |
| Explain Selection | `Cmd/Ctrl+Shift+E` |
| Refactor Selection | `Cmd/Ctrl+Shift+R` |
| Fix Error at Cursor | `Cmd/Ctrl+Shift+F` |
| Generate Tests | Command Palette |
| Generate Commit Message | SCM panel button |
| Switch Model | Status bar click |

All commands also available via right-click context menu and Command Palette (`Cmd+Shift+P` → `Local Keep AI:`).

## Models

Click the **Local Keep AI** status bar item (bottom right) to switch models. Works with:
- `cloud:*` — Local Keep AI-hosted GPU models (free tier + paid)
- `openrouter:*` — 100+ free OpenRouter models
- `ollama:*` — local Ollama models
- `llama_cpp:*` — local GGUF models

## Settings

| Setting | Default | Description |
|---|---|---|
| `lk.model` | (empty) | Override model (blank = `~/.sage/config.json`) |
| `lk.autoComplete` | `false` | Ghost-text inline completions |
| `lk.contextLines` | `50` | Lines of context sent with code actions |

## Links

- Website: [localkeep.ai](https://localkeep.ai)
- Docs: [localkeep.ai/docs](https://localkeep.ai/docs)
- Issues: [github.com/laynef/localkeep-vscode](https://github.com/laynef/localkeep-vscode)
