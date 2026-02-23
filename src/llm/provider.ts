export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  system?: string;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
}
