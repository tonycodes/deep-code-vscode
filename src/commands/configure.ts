import * as vscode from 'vscode';

const API_KEY_SECRET = 'deepCode.apiKey';

export async function configureApiKey(context: vscode.ExtensionContext): Promise<void> {
  const existingKey = await context.secrets.get(API_KEY_SECRET);

  const input = await vscode.window.showInputBox({
    title: 'Deep Code: Configure API Key',
    prompt: 'Enter your RAG Platform API key',
    password: true,
    placeHolder: 'rak_...',
    value: existingKey ? '••••••••' : undefined,
    ignoreFocusOut: true,
  });

  if (input === undefined) {
    return; // User cancelled
  }

  if (input === '••••••••' && existingKey) {
    vscode.window.showInformationMessage('Deep Code: API key unchanged.');
    return;
  }

  if (!input.trim()) {
    await context.secrets.delete(API_KEY_SECRET);
    vscode.window.showInformationMessage('Deep Code: API key removed.');
    return;
  }

  await context.secrets.store(API_KEY_SECRET, input.trim());
  vscode.window.showInformationMessage('Deep Code: API key saved securely.');
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(API_KEY_SECRET);
}
