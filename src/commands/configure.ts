import * as vscode from 'vscode';
import type { ProviderManager, ProviderId } from '../llm/providerManager';

const ANTHROPIC_KEY_SECRET = 'deepCode.anthropicApiKey';
const CLAUDE_MAX_SECRET = 'deepCode.claudeMaxToken';

export async function configureAnthropicKey(context: vscode.ExtensionContext): Promise<void> {
  await configureSecret(context, {
    secretKey: ANTHROPIC_KEY_SECRET,
    title: 'Deep Code: Configure Anthropic API Key',
    prompt: 'Enter your Anthropic API key for Claude',
    placeHolder: 'sk-ant-api...',
    label: 'Anthropic API key',
  });
}

export async function configureClaudeMaxToken(context: vscode.ExtensionContext): Promise<void> {
  await configureSecret(context, {
    secretKey: CLAUDE_MAX_SECRET,
    title: 'Deep Code: Configure Claude Max Token',
    prompt: 'Enter your Claude Max OAuth token (run "claude setup-token" to get it)',
    placeHolder: 'sk-ant-oat01-...',
    label: 'Claude Max token',
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
      label: 'Claude (Max Plan)',
      description: currentId === 'claude-max' ? '(current)' : undefined,
      detail: 'Uses your Claude Max/Pro subscription — run "claude setup-token" for token',
      providerId: 'claude-max',
    },
    {
      label: 'Claude (API Key)',
      description: currentId === 'claude' ? '(current)' : undefined,
      detail: 'Uses Claude via Anthropic API — requires API key from console.anthropic.com',
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
