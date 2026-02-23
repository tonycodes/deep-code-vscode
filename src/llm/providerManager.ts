import * as vscode from 'vscode';
import type { LLMProvider } from './provider';
import { CopilotProvider } from './copilotProvider';
import { ClaudeProvider, CLAUDE_API_CONFIG, CLAUDE_MAX_CONFIG } from './claudeProvider';

export type ProviderId = 'copilot' | 'claude' | 'claude-max';

const PROVIDER_IDS: ProviderId[] = ['copilot', 'claude', 'claude-max'];

export class ProviderManager implements vscode.Disposable {
  private providers: Map<ProviderId, LLMProvider>;
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.providers = new Map<ProviderId, LLMProvider>([
      ['copilot', new CopilotProvider()],
      ['claude', new ClaudeProvider(context, CLAUDE_API_CONFIG)],
      ['claude-max', new ClaudeProvider(context, CLAUDE_MAX_CONFIG)],
    ]);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('deepCode.llmProvider')) {
          const id = this.getConfiguredProviderId();
          vscode.window.showInformationMessage(
            `Deep Code: Switched to ${this.providers.get(id)?.name || id}`,
          );
        }
      }),
    );
  }

  getConfiguredProviderId(): ProviderId {
    const config = vscode.workspace.getConfiguration('deepCode');
    const id = config.get<string>('llmProvider') || 'copilot';
    if (PROVIDER_IDS.includes(id as ProviderId)) {
      return id as ProviderId;
    }
    return 'copilot';
  }

  getProvider(id?: ProviderId): LLMProvider {
    const providerId = id || this.getConfiguredProviderId();
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown LLM provider: ${providerId}`);
    }
    return provider;
  }

  async getAvailableProvider(): Promise<LLMProvider> {
    const preferred = this.getProvider();
    if (await preferred.isAvailable()) {
      return preferred;
    }

    // Try other providers as fallback
    for (const id of PROVIDER_IDS) {
      if (id === preferred.id) continue;
      const fallback = this.providers.get(id)!;
      if (await fallback.isAvailable()) {
        vscode.window.showWarningMessage(
          `Deep Code: ${preferred.name} unavailable, falling back to ${fallback.name}`,
        );
        return fallback;
      }
    }

    throw new Error(
      'No LLM provider available. Install GitHub Copilot, configure an Anthropic API key, or set up a Claude Max token.',
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
