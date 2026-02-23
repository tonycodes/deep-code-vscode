import * as vscode from 'vscode';

export class ContextViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const item = new vscode.TreeItem('Context coming soon...', vscode.TreeItemCollapsibleState.None);
    item.description = 'Code context awareness';
    return [item];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
