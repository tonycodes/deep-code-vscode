import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const mockHttpsRequest = vi.fn();
vi.mock('https', () => ({ request: mockHttpsRequest }));

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
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      activeTextEditor: undefined,
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
  mockHttpsRequest.mockReset();
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
    // 1 providerManager + 3 commands + 1 webview provider + 1 askAiProvider = 6
    expect(mockContext.subscriptions.length).toBe(6);
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
    expect(claude.name).toBe('Claude (API Key)');

    const claudeMax = manager.getProvider('claude-max');
    expect(claudeMax.id).toBe('claude-max');
    expect(claudeMax.name).toBe('Claude (Max Plan)');
  });

  it('returns claude-max provider when configured', async () => {
    mockConfig.set('llmProvider', 'claude-max');
    const { ProviderManager } = await import('../llm/providerManager');
    const mockContext = {
      secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
    };
    const manager = new ProviderManager(mockContext as never);
    expect(manager.getConfiguredProviderId()).toBe('claude-max');
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
    const { ClaudeProvider, CLAUDE_API_CONFIG } = await import('../llm/claudeProvider');
    const mockContext = {
      secrets: { get: vi.fn().mockResolvedValue(undefined) },
    };
    const provider = new ClaudeProvider(mockContext as never, CLAUDE_API_CONFIG);
    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });

  it('reports available when API key is stored', async () => {
    const { ClaudeProvider, CLAUDE_API_CONFIG } = await import('../llm/claudeProvider');
    const mockContext = {
      secrets: { get: vi.fn().mockResolvedValue('sk-ant-test-key') },
    };
    const provider = new ClaudeProvider(mockContext as never, CLAUDE_API_CONFIG);
    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it('uses x-api-key header for API calls', async () => {
    const { ClaudeProvider, CLAUDE_API_CONFIG } = await import('../llm/claudeProvider');
    const mockContext = {
      secrets: { get: vi.fn().mockResolvedValue('sk-ant-api03-test-key') },
    };
    const provider = new ClaudeProvider(mockContext as never, CLAUDE_API_CONFIG);

    const fakeRes = new EventEmitter() as EventEmitter & { statusCode: number };
    fakeRes.statusCode = 200;
    const fakeReq = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });

    mockHttpsRequest.mockImplementation((_opts: unknown, cb: (res: typeof fakeRes) => void) => {
      process.nextTick(() => {
        cb(fakeRes);
        fakeRes.emit('data', Buffer.from(JSON.stringify({ content: [{ type: 'text', text: 'hello' }] })));
        fakeRes.emit('end');
      });
      return fakeReq;
    });

    await provider.chat([{ role: 'user', content: 'hi' }]);

    const headers = mockHttpsRequest.mock.calls[0][0].headers;
    expect(headers['x-api-key']).toBe('sk-ant-api03-test-key');
  });

  it('wraps connection errors with context', async () => {
    const { ClaudeProvider, CLAUDE_API_CONFIG } = await import('../llm/claudeProvider');
    const mockContext = {
      secrets: { get: vi.fn().mockResolvedValue('sk-ant-api03-test-key') },
    };
    const provider = new ClaudeProvider(mockContext as never, CLAUDE_API_CONFIG);

    const fakeReq = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });

    mockHttpsRequest.mockImplementation(() => {
      process.nextTick(() => fakeReq.emit('error', new Error('ECONNREFUSED')));
      return fakeReq;
    });

    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'Failed to connect to Anthropic API: ECONNREFUSED',
    );
  });
});

describe('ClaudeCliProvider', () => {
  it('has correct id and name', async () => {
    const { ClaudeCliProvider } = await import('../llm/claudeCliProvider');
    const mockContext = {
      secrets: { get: vi.fn() },
    };
    const provider = new ClaudeCliProvider(mockContext as never);
    expect(provider.id).toBe('claude-max');
    expect(provider.name).toBe('Claude (Max Plan)');
  });

  it('reports unavailable when no token stored', async () => {
    const { ClaudeCliProvider } = await import('../llm/claudeCliProvider');
    const mockContext = {
      secrets: { get: vi.fn().mockResolvedValue(undefined) },
    };
    const provider = new ClaudeCliProvider(mockContext as never);
    const available = await provider.isAvailable();
    expect(available).toBe(false);
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
