import * as vscode from 'vscode';
import { configureApiKey } from './commands/configure';
import { SearchViewProvider } from './views/searchView';
import { ContextViewProvider } from './views/contextView';
import { AskAiViewProvider } from './views/askAiView';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  try {
    outputChannel = vscode.window.createOutputChannel('Deep Code');
    outputChannel.appendLine('Activating Deep Code extension...');

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('deepCode.configure', () => configureApiKey(context)),
    );

    // Register tree data providers for sidebar views
    const searchProvider = new SearchViewProvider();
    const contextProvider = new ContextViewProvider();
    const askAiProvider = new AskAiViewProvider();

    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('deepCode.search', searchProvider),
      vscode.window.registerTreeDataProvider('deepCode.context', contextProvider),
      vscode.window.registerTreeDataProvider('deepCode.askAi', askAiProvider),
    );

    outputChannel.appendLine('Deep Code extension activated successfully.');
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
