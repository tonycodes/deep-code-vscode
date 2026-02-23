import * as https from 'https';
import type { IncomingMessage } from 'http';
import * as vscode from 'vscode';
import type { LLMProvider, ChatMessage, ChatOptions } from './provider';

const ANTHROPIC_HOST = 'api.anthropic.com';
const ANTHROPIC_PATH = '/v1/messages';
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
    const payload = JSON.stringify(body);

    const responseBody = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        { hostname: ANTHROPIC_HOST, path: ANTHROPIC_PATH, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) } },
        (res: IncomingMessage) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(this.formatErrorSync(res.statusCode, data)));
            } else {
              resolve(data);
            }
          });
        },
      );
      req.on('error', (err: Error) => reject(new Error(`Failed to connect to Anthropic API: ${err.message}`)));
      req.write(payload);
      req.end();
    });

    const data = JSON.parse(responseBody) as AnthropicResponse;
    return data.content.map((block) => block.text).join('');
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    const { body, headers } = await this.buildRequest(messages, options, true);
    const payload = JSON.stringify(body);

    const stream = await new Promise<{ statusCode: number; stream: IncomingMessage }>((resolve, reject) => {
      const req = https.request(
        { hostname: ANTHROPIC_HOST, path: ANTHROPIC_PATH, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) } },
        (res: IncomingMessage) => resolve({ statusCode: res.statusCode || 0, stream: res }),
      );
      req.on('error', (err: Error) => reject(new Error(`Failed to connect to Anthropic API: ${err.message}`)));
      req.write(payload);
      req.end();
    });

    if (stream.statusCode >= 400) {
      let errorBody = '';
      for await (const chunk of stream.stream) {
        errorBody += chunk.toString();
      }
      throw new Error(this.formatErrorSync(stream.statusCode, errorBody));
    }

    let buffer = '';
    for await (const chunk of stream.stream) {
      buffer += chunk.toString();
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

    headers['x-api-key'] = apiKey;

    return { body, headers };
  }

  private formatErrorSync(statusCode: number, body: string): string {
    try {
      const data = JSON.parse(body) as { error?: { message?: string } };
      const msg = data?.error?.message || `HTTP ${statusCode}`;
      if (statusCode === 401) {
        return this.config.invalidKeyMessage;
      }
      return `Anthropic API error (${statusCode}): ${msg}`;
    } catch {
      return `Anthropic API error (${statusCode}): ${body.slice(0, 200)}`;
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
