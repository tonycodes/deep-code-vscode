import * as vscode from 'vscode';
import type { LLMProvider, ChatMessage, ChatOptions } from './provider';

function toVscodeMessages(messages: ChatMessage[]): vscode.LanguageModelChatMessage[] {
  const result: vscode.LanguageModelChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      result.push(vscode.LanguageModelChatMessage.Assistant(msg.content));
    } else {
      // Both 'user' and 'system' map to User (VS Code LM API has no system role)
      result.push(vscode.LanguageModelChatMessage.User(msg.content));
    }
  }

  return result;
}

async function selectModel(): Promise<vscode.LanguageModelChat | undefined> {
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  return models[0];
}

export class CopilotProvider implements LLMProvider {
  readonly id = 'copilot';
  readonly name = 'GitHub Copilot';

  async isAvailable(): Promise<boolean> {
    const model = await selectModel();
    return model !== undefined;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const model = await selectModel();
    if (!model) {
      throw new Error('GitHub Copilot is not available. Is the extension installed and signed in?');
    }

    const vscodeMessages = this.buildMessages(messages, options?.system);

    const response = await model.sendRequest(vscodeMessages, {
      justification: 'Deep Code AI request',
    });

    let result = '';
    for await (const fragment of response.text) {
      result += fragment;
    }
    return result;
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    const model = await selectModel();
    if (!model) {
      throw new Error('GitHub Copilot is not available. Is the extension installed and signed in?');
    }

    const vscodeMessages = this.buildMessages(messages, options?.system);

    const response = await model.sendRequest(vscodeMessages, {
      justification: 'Deep Code AI request',
    });

    for await (const fragment of response.text) {
      yield fragment;
    }
  }

  private buildMessages(
    messages: ChatMessage[],
    system?: string,
  ): vscode.LanguageModelChatMessage[] {
    const allMessages: ChatMessage[] = [];

    // Prepend system prompt as first User message (VS Code LM API has no system role)
    if (system) {
      allMessages.push({ role: 'system', content: system });
    }

    allMessages.push(...messages);
    return toVscodeMessages(allMessages);
  }
}
