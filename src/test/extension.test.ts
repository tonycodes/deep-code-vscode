import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module since it's not available outside the Extension Host
const mockConfig = new Map<string, unknown>();

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
      showWarningMessage: vi.fn(),
      showInputBox: vi.fn(),
      showQuickPick: vi.fn(),
      registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
      registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    Uri: {
      joinPath: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string) => mockConfig.get(key)),
        update: vi.fn((key: string, value: unknown) => {
          mockConfig.set(key, value);
        }),
      })),
    },
    lm: {
      selectChatModels: vi.fn().mockResolvedValue([]),
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
    LanguageModelChatMessage: {
      User: vi.fn((content: string) => ({ role: 1, content })),
      Assistant: vi.fn((content: string) => ({ role: 2, content })),
    },
  }),
  { virtual: true },
);

beforeEach(() => {
  mockConfig.clear();
});

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
    // 1 providerManager + 3 commands + 2 tree providers + 1 webview provider = 7
    expect(mockContext.subscriptions.length).toBe(7);
  });

  it('deactivate is a function', async () => {
    const { deactivate } = await import('../extension');
    expect(typeof deactivate).toBe('function');
  });
});

describe('ProviderManager', () => {
  it('defaults to copilot provider', async () => {
    const { ProviderManager } = await import('../llm/providerManager');
    const mockContext = {
      secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
    };
    const manager = new ProviderManager(mockContext as never);
    expect(manager.getConfiguredProviderId()).toBe('copilot');
  });

  it('returns claude provider when configured', async () => {
    mockConfig.set('llmProvider', 'claude');
    const { ProviderManager } = await import('../llm/providerManager');
    const mockContext = {
      secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
    };
    const manager = new ProviderManager(mockContext as never);
    expect(manager.getConfiguredProviderId()).toBe('claude');
  });

  it('getProvider returns a provider with correct id', async () => {
    const { ProviderManager } = await import('../llm/providerManager');
    const mockContext = {
      secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
    };
    const manager = new ProviderManager(mockContext as never);

    const copilot = manager.getProvider('copilot');
    expect(copilot.id).toBe('copilot');
    expect(copilot.name).toBe('GitHub Copilot');

    const claude = manager.getProvider('claude');
    expect(claude.id).toBe('claude');
    expect(claude.name).toBe('Claude (Anthropic)');
  });
});

describe('CopilotProvider', () => {
  it('reports unavailable when no models found', async () => {
    const { CopilotProvider } = await import('../llm/copilotProvider');
    const provider = new CopilotProvider();
    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });
});

describe('ClaudeProvider', () => {
  it('reports unavailable when no API key stored', async () => {
    const { ClaudeProvider } = await import('../llm/claudeProvider');
    const mockContext = {
      secrets: { get: vi.fn().mockResolvedValue(undefined) },
    };
    const provider = new ClaudeProvider(mockContext as never);
    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });

  it('reports available when API key is stored', async () => {
    const { ClaudeProvider } = await import('../llm/claudeProvider');
    const mockContext = {
      secrets: { get: vi.fn().mockResolvedValue('sk-ant-test-key') },
    };
    const provider = new ClaudeProvider(mockContext as never);
    const available = await provider.isAvailable();
    expect(available).toBe(true);
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
  it('has correct view type', async () => {
    const { AskAiViewProvider } = await import('../views/askAiView');
    expect(AskAiViewProvider.viewType).toBe('deepCode.askAi');
  });

  it('constructs with extension uri and provider manager', async () => {
    const { AskAiViewProvider } = await import('../views/askAiView');
    const { ProviderManager } = await import('../llm/providerManager');
    const mockContext = {
      secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
    };
    const manager = new ProviderManager(mockContext as never);
    const mockUri = { fsPath: '/test' };
    const provider = new AskAiViewProvider(mockUri as never, manager);
    expect(provider).toBeDefined();
  });
});
