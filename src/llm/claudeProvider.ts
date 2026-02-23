import * as vscode from 'vscode';
import type { LLMProvider, ChatMessage, ChatOptions } from './provider';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface ClaudeProviderConfig {
  id: string;
  name: string;
  secretKey: string;
  missingKeyMessage: string;
  invalidKeyMessage: string;
}

export const CLAUDE_API_CONFIG: ClaudeProviderConfig = {
  id: 'claude',
  name: 'Claude (API Key)',
  secretKey: 'deepCode.anthropicApiKey',
  missingKeyMessage: 'Anthropic API key not configured. Run "Deep Code: Configure Anthropic API Key" first.',
  invalidKeyMessage: 'Invalid Anthropic API key. Run "Deep Code: Configure Anthropic API Key" to update it.',
};

export const CLAUDE_MAX_CONFIG: ClaudeProviderConfig = {
  id: 'claude-max',
  name: 'Claude (Max Plan)',
  secretKey: 'deepCode.claudeMaxToken',
  missingKeyMessage:
    'Claude Max token not configured. Run "Deep Code: Configure Claude Max Token" first.\n' +
    'Get your token by running: claude setup-token',
  invalidKeyMessage:
    'Invalid Claude Max token. Run "Deep Code: Configure Claude Max Token" to update it.\n' +
    'Get a fresh token by running: claude setup-token',
};

export class ClaudeProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;

  private context: vscode.ExtensionContext;
  private config: ClaudeProviderConfig;

  constructor(context: vscode.ExtensionContext, config: ClaudeProviderConfig) {
    this.context = context;
    this.config = config;
    this.id = config.id;
    this.name = config.name;
  }

  async isAvailable(): Promise<boolean> {
    const key = await this.context.secrets.get(this.config.secretKey);
    return !!key;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const { body, headers } = await this.buildRequest(messages, options, false);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`Failed to connect to Anthropic API: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
      throw new Error(await this.formatError(response));
    }

    const data = (await response.json()) as AnthropicResponse;
    return data.content.map((block) => block.text).join('');
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    const { body, headers } = await this.buildRequest(messages, options, true);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`Failed to connect to Anthropic API: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
      throw new Error(await this.formatError(response));
    }

    if (!response.body) {
      throw new Error('No response body received from Anthropic API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const event = JSON.parse(data) as AnthropicStreamEvent;
            if (event.type === 'content_block_delta' && event.delta?.text) {
              yield event.delta.text;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async buildRequest(
    messages: ChatMessage[],
    options: ChatOptions | undefined,
    stream: boolean,
  ): Promise<{ body: AnthropicRequest; headers: Record<string, string> }> {
    const apiKey = await this.context.secrets.get(this.config.secretKey);
    if (!apiKey) {
      throw new Error(this.config.missingKeyMessage);
    }

    const model =
      vscode.workspace.getConfiguration('deepCode').get<string>('claude.model') ||
      'claude-sonnet-4-20250514';

    const anthropicMessages: AnthropicMessage[] = [];
    let system: string | undefined = options?.system;

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = system ? `${system}\n\n${msg.content}` : msg.content;
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: AnthropicRequest = {
      model,
      max_tokens: options?.maxTokens || 4096,
      messages: anthropicMessages,
      stream,
    };

    if (system) {
      body.system = system;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    };

    // OAuth tokens (from claude setup-token) use Bearer auth; API keys use x-api-key
    if (apiKey.startsWith('sk-ant-oat')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['x-api-key'] = apiKey;
    }

    return { body, headers };
  }

  private async formatError(response: Response): Promise<string> {
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      const msg = data?.error?.message || response.statusText;
      if (response.status === 401) {
        return this.config.invalidKeyMessage;
      }
      return `Anthropic API error (${response.status}): ${msg}`;
    } catch {
      return `Anthropic API error (${response.status}): ${response.statusText}`;
    }
  }
}

// Anthropic API types (minimal, only what we need)

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  stream: boolean;
  system?: string;
}

interface AnthropicResponse {
  content: { type: string; text: string }[];
}

interface AnthropicStreamEvent {
  type: string;
  delta?: { text?: string };
}
