import { spawn } from 'child_process';
import * as vscode from 'vscode';
import type { LLMProvider, ChatMessage, ChatOptions } from './provider';

const SECRET_KEY = 'deepCode.claudeMaxToken';

export class ClaudeCliProvider implements LLMProvider {
  readonly id = 'claude-max';
  readonly name = 'Claude (Max Plan)';

  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private getWorkspacePath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  async isAvailable(): Promise<boolean> {
    const token = await this.context.secrets.get(SECRET_KEY);
    if (!token) return false;
    return await this.cliExists();
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const prompt = this.buildPrompt(messages, options);
    const result = await this.runCli(prompt);

    if (result.is_error) {
      throw new Error(result.result || 'Claude CLI returned an error');
    }

    return result.result;
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
    const prompt = this.buildPrompt(messages, options);
    const token = await this.context.secrets.get(SECRET_KEY);
    if (!token) {
      throw new Error(
        'Claude Max token not configured. Run "Deep Code: Configure Claude Max Token" first.\n' +
          'Get your token by running: claude setup-token',
      );
    }

    const model = vscode.workspace.getConfiguration('deepCode').get<string>('claude.model') || '';
    const args = ['-p', prompt, '--output-format', 'text', '--max-turns', '5'];
    if (model) {
      args.push('--model', model);
    }

    const proc = spawn('claude', args, {
      cwd: this.getWorkspacePath(),
      env: { ...process.env, CLAUDECODE: '', CLAUDE_CODE_OAUTH_TOKEN: token },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

    for await (const chunk of proc.stdout) {
      yield chunk.toString();
    }

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      throw new Error(`Claude CLI exited with code ${exitCode}: ${stderr.trim()}`);
    }
  }

  private buildPrompt(messages: ChatMessage[], options?: ChatOptions): string {
    const parts: string[] = [];

    if (options?.system) {
      parts.push(options.system);
      parts.push('');
    }

    // Include conversation history for multi-turn context
    for (const msg of messages) {
      if (msg.role === 'system') {
        parts.push(msg.content);
        parts.push('');
      } else if (msg.role === 'assistant') {
        parts.push(`Assistant: ${msg.content}`);
        parts.push('');
      } else {
        parts.push(`User: ${msg.content}`);
        parts.push('');
      }
    }

    return parts.join('\n').trim();
  }

  private async runCli(prompt: string): Promise<CliResult> {
    const token = await this.context.secrets.get(SECRET_KEY);
    if (!token) {
      throw new Error(
        'Claude Max token not configured. Run "Deep Code: Configure Claude Max Token" first.\n' +
          'Get your token by running: claude setup-token',
      );
    }

    const model = vscode.workspace.getConfiguration('deepCode').get<string>('claude.model') || '';
    const args = ['-p', prompt, '--output-format', 'json', '--max-turns', '5'];
    if (model) {
      args.push('--model', model);
    }

    return new Promise<CliResult>((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd: this.getWorkspacePath(),
        env: { ...process.env, CLAUDECODE: '', CLAUDE_CODE_OAUTH_TOKEN: token },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      proc.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

      proc.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.trim()}`));
          return;
        }
        try {
          const result = JSON.parse(stdout) as CliResult;
          resolve(result);
        } catch {
          reject(new Error(`Failed to parse Claude CLI output: ${stdout.slice(0, 200)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
      });
    });
  }

  private async cliExists(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('claude', ['--version'], {
        env: { ...process.env, CLAUDECODE: '' },
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }
}

interface CliResult {
  type: string;
  subtype: string;
  is_error: boolean;
  result: string;
}
