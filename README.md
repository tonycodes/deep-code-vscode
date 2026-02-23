# Deep Code

AI-powered chat for VS Code with editor context awareness.

## Features

- **Ask AI** — Chat with an LLM directly in the VS Code sidebar with streaming responses
- **Editor context** — Automatically includes your current file, selection, and language for relevant answers
- **3 LLM providers** — Choose between GitHub Copilot, Claude Max/Pro, or Claude API

## Setup

1. Install the extension (`.vsix` or marketplace)
2. Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run **"Deep Code: Switch LLM Provider"** to pick your provider

### Provider setup

| Provider | Setup |
|----------|-------|
| **GitHub Copilot** | Works automatically with your Copilot subscription (default) |
| **Claude (Max Plan)** | Run `claude setup-token` in your terminal, then use **"Deep Code: Configure Claude Max Token"** |
| **Claude (API Key)** | Get a key from [console.anthropic.com](https://console.anthropic.com), then use **"Deep Code: Configure Anthropic API Key"** |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `deepCode.llmProvider` | `copilot` | LLM provider (`copilot`, `claude-max`, `claude`) |
| `deepCode.claude.model` | `claude-sonnet-4-20250514` | Claude model for both Max and API key providers |

## Development

### Prerequisites

- Node.js 20+
- VS Code 1.95+

### Setup

```bash
git clone https://github.com/tonycodes/deep-code-vscode.git
cd deep-code-vscode
npm install
```

### Debug

Open the project in VS Code and press **F5** to launch the Extension Development Host. The "Deep Code" icon will appear in the activity bar.

### Build

```bash
npm run build        # Bundle with esbuild
npm run watch        # Watch mode for development
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run test         # Run tests
npm run package      # Create .vsix package
```

## Install from VSIX

```bash
code --install-extension deep-code-vscode-0.1.0.vsix
```

## License

MIT
