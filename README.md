# Deep Code

AI-powered code context, semantic search, and Q&A for VS Code — powered by [RAG Platform](https://github.com/tonycodes/rag-platform).

## Features

- **Semantic Search** — Find code by meaning, not just text matching
- **Code Context** — Understand relationships and dependencies in your codebase
- **Ask AI** — Get answers about your code with full context awareness

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

## Configuration

1. Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run **"Deep Code: Configure API Key"**
3. Enter your RAG Platform API key

Set the API URL in VS Code settings:

```json
{
  "deepCode.apiUrl": "https://api.rag.test"
}
```

## Install from VSIX

```bash
code --install-extension deep-code-vscode-0.1.0.vsix
```

## License

MIT
