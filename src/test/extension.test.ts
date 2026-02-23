import { describe, it, expect, vi } from 'vitest';

// Mock vscode module since it's not available outside the Extension Host
vi.mock(
  'vscode',
  () => ({
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showInputBox: vi.fn(),
      registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    EventEmitter: vi.fn().mockImplementation(() => ({
      event: vi.fn(),
      fire: vi.fn(),
      dispose: vi.fn(),
    })),
    TreeItem: class TreeItem {
      label: string;
      collapsibleState: number;
      description?: string;
      constructor(label: string, collapsibleState: number = 0) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  }),
  { virtual: true },
);

describe('extension', () => {
  it('activates without errors', async () => {
    const { activate } = await import('../extension');

    const mockContext = {
      subscriptions: [] as { dispose: () => void }[],
      secrets: {
        get: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
      },
    };

    expect(() => activate(mockContext as never)).not.toThrow();
    expect(mockContext.subscriptions.length).toBe(4); // 1 command + 3 tree providers
  });

  it('deactivate is a function', async () => {
    const { deactivate } = await import('../extension');
    expect(typeof deactivate).toBe('function');
  });
});

describe('SearchViewProvider', () => {
  it('returns placeholder items', async () => {
    const { SearchViewProvider } = await import('../views/searchView');
    const provider = new SearchViewProvider();
    const items = provider.getChildren();
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Search coming soon...');
  });
});

describe('ContextViewProvider', () => {
  it('returns placeholder items', async () => {
    const { ContextViewProvider } = await import('../views/contextView');
    const provider = new ContextViewProvider();
    const items = provider.getChildren();
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Context coming soon...');
  });
});

describe('AskAiViewProvider', () => {
  it('returns placeholder items', async () => {
    const { AskAiViewProvider } = await import('../views/askAiView');
    const provider = new AskAiViewProvider();
    const items = provider.getChildren();
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Ask AI coming soon...');
  });
});
