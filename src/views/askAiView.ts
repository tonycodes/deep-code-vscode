import * as vscode from 'vscode';

export class AskAiViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const item = new vscode.TreeItem('Ask AI coming soon...', vscode.TreeItemCollapsibleState.None);
    item.description = 'AI-powered Q&A';
    return [item];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
