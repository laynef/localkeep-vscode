# Sage AI — VS Code Extension

Local-first AI coding assistant. **200+ free models, no API key required** for local models.

## Install

Search **"Sage AI"** in the VS Code Extensions marketplace, or:

```bash
code --install-extension sageworksai.sage-ai
```

Then install the CLI: `pip install sage-ai-cli && sage login`

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

All commands also available via right-click context menu and Command Palette (`Cmd+Shift+P` → `Sage:`).

## Models

Click the **Sage** status bar item (bottom right) to switch models. Works with:
- `cloud:*` — sage-hosted GPU models (free tier + paid)
- `openrouter:*` — 100+ free OpenRouter models
- `ollama:*` — local Ollama models
- `llama_cpp:*` — local GGUF models

## Settings

| Setting | Default | Description |
|---|---|---|
| `sage.model` | (empty) | Override model (blank = `~/.sage/config.json`) |
| `sage.autoComplete` | `false` | Ghost-text inline completions |
| `sage.contextLines` | `50` | Lines of context sent with code actions |

## Links

- Website: [sageworksai.com](https://sageworksai.com)
- Docs: [sageworksai.com/docs](https://sageworksai.com/docs)
- Issues: [github.com/sageworksai/sage-vscode](https://github.com/sageworksai/sage-vscode)
