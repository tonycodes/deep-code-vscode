import * as vscode from 'vscode';
import type { ProviderManager, ProviderId } from '../llm/providerManager';

const API_KEY_SECRET = 'deepCode.apiKey';
const ANTHROPIC_KEY_SECRET = 'deepCode.anthropicApiKey';

export async function configureApiKey(context: vscode.ExtensionContext): Promise<void> {
  await configureSecret(context, {
    secretKey: API_KEY_SECRET,
    title: 'Deep Code: Configure API Key',
    prompt: 'Enter your RAG Platform API key',
    placeHolder: 'rak_...',
    label: 'API key',
  });
}

export async function configureAnthropicKey(context: vscode.ExtensionContext): Promise<void> {
  await configureSecret(context, {
    secretKey: ANTHROPIC_KEY_SECRET,
    title: 'Deep Code: Configure Anthropic API Key',
    prompt: 'Enter your Anthropic API key for Claude',
    placeHolder: 'sk-ant-...',
    label: 'Anthropic API key',
  });
}

export async function switchProvider(providerManager: ProviderManager): Promise<void> {
  const currentId = providerManager.getConfiguredProviderId();

  const items: (vscode.QuickPickItem & { providerId: ProviderId })[] = [
    {
      label: 'GitHub Copilot',
      description: currentId === 'copilot' ? '(current)' : undefined,
      detail: 'Uses your existing Copilot subscription — no API key needed',
      providerId: 'copilot',
    },
    {
      label: 'Claude (Anthropic)',
      description: currentId === 'claude' ? '(current)' : undefined,
      detail: 'Uses Claude via Anthropic API — requires API key',
      providerId: 'claude',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Deep Code: Switch LLM Provider',
    placeHolder: 'Select an LLM provider',
  });

  if (!picked || picked.providerId === currentId) {
    return;
  }

  await vscode.workspace.getConfiguration('deepCode').update('llmProvider', picked.providerId, true);
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(API_KEY_SECRET);
}

async function configureSecret(
  context: vscode.ExtensionContext,
  opts: { secretKey: string; title: string; prompt: string; placeHolder: string; label: string },
): Promise<void> {
  const existingKey = await context.secrets.get(opts.secretKey);

  const input = await vscode.window.showInputBox({
    title: opts.title,
    prompt: opts.prompt,
    password: true,
    placeHolder: opts.placeHolder,
    value: existingKey ? '••••••••' : undefined,
    ignoreFocusOut: true,
  });

  if (input === undefined) {
    return;
  }

  if (input === '••••••••' && existingKey) {
    vscode.window.showInformationMessage(`Deep Code: ${opts.label} unchanged.`);
    return;
  }

  if (!input.trim()) {
    await context.secrets.delete(opts.secretKey);
    vscode.window.showInformationMessage(`Deep Code: ${opts.label} removed.`);
    return;
  }

  await context.secrets.store(opts.secretKey, input.trim());
  vscode.window.showInformationMessage(`Deep Code: ${opts.label} saved securely.`);
}
