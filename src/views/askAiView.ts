import * as vscode from 'vscode';
import type { ProviderManager } from '../llm/providerManager';
import type { ChatMessage } from '../llm/provider';

export class AskAiViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'deepCode.askAi';

  private webviewView?: vscode.WebviewView;
  private conversationHistory: ChatMessage[] = [];
  private isStreaming = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly providerManager: ProviderManager,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this.handleUserMessage(message.text);
          break;
        case 'clearChat':
          this.conversationHistory = [];
          this.postMessage({ type: 'chatCleared' });
          break;
        case 'stopStreaming':
          this.isStreaming = false;
          break;
      }
    });

    // Send initial provider info
    const provider = this.providerManager.getProvider();
    this.postMessage({ type: 'providerInfo', name: provider.name });
  }

  private getEditorContext(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';

    const doc = editor.document;
    const filePath = vscode.workspace.asRelativePath(doc.uri);
    const selection = editor.selection;

    if (!selection.isEmpty) {
      const selectedText = doc.getText(selection);
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      return (
        `\n\nThe user has selected code in ${filePath} (lines ${startLine}-${endLine}):\n` +
        '```\n' + selectedText + '\n```'
      );
    }

    // No selection — include the visible range for context
    const visibleRange = editor.visibleRanges[0];
    if (visibleRange) {
      const visibleText = doc.getText(visibleRange);
      const startLine = visibleRange.start.line + 1;
      const endLine = visibleRange.end.line + 1;
      return (
        `\n\nThe user is viewing ${filePath} (lines ${startLine}-${endLine}):\n` +
        '```\n' + visibleText + '\n```'
      );
    }

    return `\n\nThe user has ${filePath} open in the editor.`;
  }

  private async handleUserMessage(text: string): Promise<void> {
    if (this.isStreaming || !text.trim()) return;

    this.conversationHistory.push({ role: 'user', content: text });
    this.postMessage({ type: 'userMessage', text });

    this.isStreaming = true;
    this.postMessage({ type: 'streamStart' });

    try {
      const provider = await this.providerManager.getAvailableProvider();
      this.postMessage({ type: 'providerInfo', name: provider.name });

      const editorContext = this.getEditorContext();
      let fullResponse = '';
      for await (const chunk of provider.chatStream(this.conversationHistory, {
        system:
          'You are Deep Code, an AI coding assistant embedded in VS Code. ' +
          'Be concise and helpful. Format code with markdown fenced code blocks.' +
          editorContext,
      })) {
        if (!this.isStreaming) break;
        fullResponse += chunk;
        this.postMessage({ type: 'streamChunk', text: chunk });
      }

      this.conversationHistory.push({ role: 'assistant', content: fullResponse });
      this.postMessage({ type: 'streamEnd' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', text: message });
    } finally {
      this.isStreaming = false;
    }
  }

  private postMessage(message: Record<string, unknown>): void {
    this.webviewView?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cspSource = webview.cspSource;

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .header .provider {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .clear-btn {
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .clear-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .message .role {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .message.user .role { color: var(--vscode-textLink-foreground); }
    .message.assistant .role { color: var(--vscode-charts-green); }

    .message .content {
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .message .content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .message .content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 6px 0;
    }

    .message .content pre code {
      background: none;
      padding: 0;
    }

    .error-msg {
      color: var(--vscode-errorForeground);
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
    }

    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 8px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 20px;
    }

    .welcome h3 {
      color: var(--vscode-foreground);
      font-size: 14px;
    }

    .welcome p {
      font-size: 12px;
      line-height: 1.5;
    }

    .typing-indicator {
      display: inline-flex;
      gap: 4px;
      padding: 4px 0;
    }

    .typing-indicator span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vscode-descriptionForeground);
      animation: blink 1.4s infinite both;
    }

    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes blink {
      0%, 80%, 100% { opacity: 0.3; }
      40% { opacity: 1; }
    }

    .input-area {
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .input-row {
      display: flex;
      gap: 6px;
    }

    textarea {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 6px 10px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: none;
      outline: none;
      min-height: 36px;
      max-height: 120px;
    }

    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    textarea::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .send-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
      align-self: flex-end;
    }

    .send-btn:hover { background: var(--vscode-button-hoverBackground); }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .stop-btn {
      background: var(--vscode-statusBarItem-errorBackground);
      color: var(--vscode-statusBarItem-errorForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="provider" id="providerLabel">Loading...</span>
    <button class="clear-btn" id="clearBtn" title="Clear chat">Clear</button>
  </div>
  <div class="messages" id="messages">
    <div class="welcome" id="welcome">
      <h3>Ask AI</h3>
      <p>Ask questions about your code, get explanations, or request help with programming tasks.</p>
    </div>
  </div>
  <div class="input-area">
    <div class="input-row">
      <textarea id="input" rows="1" placeholder="Ask a question..." autofocus></textarea>
      <button class="send-btn" id="sendBtn">Send</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const welcomeEl = document.getElementById('welcome');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const providerLabel = document.getElementById('providerLabel');

    let isStreaming = false;
    let currentAssistantEl = null;

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function renderMarkdown(text) {
      // Simple markdown: code blocks, inline code, bold, italic
      let html = escapeHtml(text);

      // Fenced code blocks
      html = html.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g,
        '<pre><code>$2</code></pre>');

      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

      // Bold
      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

      // Italic
      html = html.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');

      return html;
    }

    function addUserMessage(text) {
      welcomeEl.style.display = 'none';
      const el = document.createElement('div');
      el.className = 'message user';
      el.innerHTML = '<span class="role">You</span><div class="content">' + escapeHtml(text) + '</div>';
      messagesEl.appendChild(el);
      scrollToBottom();
    }

    function startAssistantMessage() {
      const el = document.createElement('div');
      el.className = 'message assistant';
      el.innerHTML = '<span class="role">AI</span><div class="content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
      messagesEl.appendChild(el);
      currentAssistantEl = el.querySelector('.content');
      scrollToBottom();
    }

    function appendChunk(text) {
      if (!currentAssistantEl) return;
      // Remove typing indicator on first chunk
      const typing = currentAssistantEl.querySelector('.typing-indicator');
      if (typing) typing.remove();

      currentAssistantEl.textContent += text;
      scrollToBottom();
    }

    function finalizeAssistantMessage() {
      if (currentAssistantEl) {
        const raw = currentAssistantEl.textContent;
        currentAssistantEl.innerHTML = renderMarkdown(raw);
      }
      currentAssistantEl = null;
    }

    function showError(text) {
      const el = document.createElement('div');
      el.className = 'error-msg';
      el.textContent = text;
      messagesEl.appendChild(el);
      scrollToBottom();
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setStreaming(streaming) {
      isStreaming = streaming;
      inputEl.disabled = streaming;
      sendBtn.textContent = streaming ? 'Stop' : 'Send';
      sendBtn.className = streaming ? 'send-btn stop-btn' : 'send-btn';
    }

    function sendMessage() {
      if (isStreaming) {
        vscode.postMessage({ type: 'stopStreaming' });
        setStreaming(false);
        finalizeAssistantMessage();
        return;
      }

      const text = inputEl.value.trim();
      if (!text) return;

      inputEl.value = '';
      inputEl.style.height = 'auto';
      vscode.postMessage({ type: 'sendMessage', text });
    }

    // Auto-resize textarea
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    // Send on Enter, newline on Shift+Enter
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);

    clearBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearChat' });
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'userMessage':
          addUserMessage(msg.text);
          break;
        case 'streamStart':
          setStreaming(true);
          startAssistantMessage();
          break;
        case 'streamChunk':
          appendChunk(msg.text);
          break;
        case 'streamEnd':
          setStreaming(false);
          finalizeAssistantMessage();
          break;
        case 'error':
          setStreaming(false);
          finalizeAssistantMessage();
          showError(msg.text);
          break;
        case 'chatCleared':
          messagesEl.innerHTML = '';
          messagesEl.appendChild(welcomeEl);
          welcomeEl.style.display = '';
          currentAssistantEl = null;
          break;
        case 'providerInfo':
          providerLabel.textContent = msg.name;
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
