import * as vscode from 'vscode';
import type { LLMProvider } from './provider';
import { CopilotProvider } from './copilotProvider';
import { ClaudeProvider } from './claudeProvider';

export type ProviderId = 'copilot' | 'claude';

export class ProviderManager implements vscode.Disposable {
  private providers: Map<ProviderId, LLMProvider>;
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.providers = new Map<ProviderId, LLMProvider>([
      ['copilot', new CopilotProvider()],
      ['claude', new ClaudeProvider(context)],
    ]);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('deepCode.llmProvider')) {
          const id = this.getConfiguredProviderId();
          vscode.window.showInformationMessage(`Deep Code: Switched to ${this.providers.get(id)?.name || id}`);
        }
      }),
    );
  }

  getConfiguredProviderId(): ProviderId {
    const config = vscode.workspace.getConfiguration('deepCode');
    const id = config.get<string>('llmProvider') || 'copilot';
    return id === 'claude' ? 'claude' : 'copilot';
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

    // Try the other provider as fallback
    const fallbackId: ProviderId = preferred.id === 'copilot' ? 'claude' : 'copilot';
    const fallback = this.providers.get(fallbackId)!;
    if (await fallback.isAvailable()) {
      vscode.window.showWarningMessage(
        `Deep Code: ${preferred.name} unavailable, falling back to ${fallback.name}`,
      );
      return fallback;
    }

    throw new Error(
      'No LLM provider available. Install GitHub Copilot or configure an Anthropic API key.',
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
