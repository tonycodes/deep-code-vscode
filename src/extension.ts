import * as vscode from 'vscode';
import { configureAnthropicKey, configureClaudeMaxToken, switchProvider } from './commands/configure';
import { AskAiViewProvider } from './views/askAiView';
import { ProviderManager } from './llm/providerManager';

let outputChannel: vscode.OutputChannel;
let providerManager: ProviderManager;

export function activate(context: vscode.ExtensionContext): void {
  try {
    outputChannel = vscode.window.createOutputChannel('Deep Code');
    outputChannel.appendLine('Activating Deep Code extension...');

    // Initialize LLM provider manager
    providerManager = new ProviderManager(context);
    context.subscriptions.push(providerManager);

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('deepCode.configureAnthropicKey', () =>
        configureAnthropicKey(context),
      ),
      vscode.commands.registerCommand('deepCode.configureClaudeMaxToken', () =>
        configureClaudeMaxToken(context),
      ),
      vscode.commands.registerCommand('deepCode.switchProvider', () =>
        switchProvider(providerManager),
      ),
    );

    // Register Ask AI as a webview provider
    const askAiProvider = new AskAiViewProvider(context.extensionUri, providerManager);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(AskAiViewProvider.viewType, askAiProvider),
      askAiProvider,
    );

    outputChannel.appendLine(
      `Deep Code activated. LLM provider: ${providerManager.getConfiguredProviderId()}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Deep Code failed to activate: ${message}`);
  }
}

export function deactivate(): void {
  if (outputChannel) {
    outputChannel.dispose();
  }
}

export function getProviderManager(): ProviderManager {
  return providerManager;
}
