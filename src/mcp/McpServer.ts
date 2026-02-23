import { WebSocketServer, WebSocket } from "ws";
import { OllamaClient, Message } from "../ollama/OllamaClient";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { logger } from "../utils/logger";
import { DispatchTaskUseCase } from "../application/orchestration/dispatch-task.usecase";
import { RunRoleGraphUseCase } from "../application/orchestration/run-role-graph.usecase";
import { RoleName } from "../domain/orchestration/entities/role";
import { RoleDelegationEvent } from "../shared/types/events";
import { writeChatEventLog } from "../operations/logging/chat-event-logger";

type ArithmeticToken =
  | { kind: "number"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" };

function tokenizeArithmeticExpression(expression: string): ArithmeticToken[] {
  const tokens: ArithmeticToken[] = [];
  let index = 0;
  while (index < expression.length) {
    const ch = expression[index];
    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let end = index + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end])) {
        end += 1;
      }
      const raw = expression.slice(index, end);
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
        throw new Error(`Invalid numeric literal: ${raw}`);
      }
      tokens.push({ kind: "number", value: Number(raw) });
      index = end;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch });
      index += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", value: ch });
      index += 1;
      continue;
    }
    throw new Error(`Unsupported character: ${ch}`);
  }
  return tokens;
}

function precedence(op: "+" | "-" | "*" | "/"): number {
  if (op === "+" || op === "-") {
    return 1;
  }
  return 2;
}

function applyOperator(values: number[], op: "+" | "-" | "*" | "/"): void {
  if (values.length < 2) {
    throw new Error("Invalid expression");
  }
  const right = values.pop()!;
  const left = values.pop()!;
  if (op === "+") {
    values.push(left + right);
    return;
  }
  if (op === "-") {
    values.push(left - right);
    return;
  }
  if (op === "*") {
    values.push(left * right);
    return;
  }
  if (right === 0) {
    throw new Error("Division by zero");
  }
  values.push(left / right);
}

export function evaluateArithmeticExpression(expression: string): number {
  const tokens = tokenizeArithmeticExpression(expression);
  if (tokens.length === 0) {
    throw new Error("Expression is empty");
  }
  const values: number[] = [];
  const operators: Array<"+" | "-" | "*" | "/" | "("> = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.kind === "number") {
      values.push(token.value);
      continue;
    }
    if (token.kind === "paren" && token.value === "(") {
      operators.push("(");
      continue;
    }
    if (token.kind === "paren" && token.value === ")") {
      while (operators.length > 0 && operators[operators.length - 1] !== "(") {
        applyOperator(values, operators.pop() as "+" | "-" | "*" | "/");
      }
      if (operators.pop() !== "(") {
        throw new Error("Mismatched parentheses");
      }
      continue;
    }
    if (token.kind === "op") {
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      const isUnaryMinusContext =
        token.value === "-" &&
        (!prev ||
          (prev.kind !== "number" &&
            !(prev.kind === "paren" && prev.value === ")")));
      if (isUnaryMinusContext && next?.kind === "number") {
        values.push(-next.value);
        i += 1;
        continue;
      }
      if (isUnaryMinusContext && next?.kind === "paren" && next.value === "(") {
        // Support expressions like "-(1+2)" as "0-(1+2)".
        values.push(0);
      }

      while (operators.length > 0) {
        const top = operators[operators.length - 1];
        if (top === "(") {
          break;
        }
        if (precedence(top) < precedence(token.value)) {
          break;
        }
        applyOperator(values, operators.pop() as "+" | "-" | "*" | "/");
      }
      operators.push(token.value);
    }
  }

  while (operators.length > 0) {
    const op = operators.pop()!;
    if (op === "(") {
      throw new Error("Mismatched parentheses");
    }
    applyOperator(values, op);
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) {
    throw new Error("Invalid expression");
  }
  return values[0];
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface Task {
  id: string;
  prompt: string;
  status: "pending" | "orchestrating" | "working" | "completed" | "failed";
  roleComposition?: RoleName[];
  delegationEvents?: RoleDelegationEvent[];
  finalResponse?: string;
}

// ツール関数の型定義
type ToolFunction = (...args: any[]) => Promise<any>;

const PLUGIN_DIR = path.join(os.homedir(), ".multi-llm-agent-cli", "plugins");

export class McpServer {
  private wss: WebSocketServer;
  private orchestratorLLM: OllamaClient;
  private workerLLM: OllamaClient;
  private tasks: Map<string, Task> = new Map(); // タスクの状態管理
  private tools: Map<string, ToolFunction> = new Map(); // 登録されたツール

  constructor(port: number = 8080) {
    this.wss = new WebSocketServer({ port });
    this.orchestratorLLM = new OllamaClient(); // 指示者LLM
    this.workerLLM = new OllamaClient(); // 作業者LLM

    // ダミーのツールを登録
    this.registerTool("calculator", async (expression: string) => {
      try {
        const result = evaluateArithmeticExpression(expression);
        return `計算結果: ${expression} = ${result}`;
      } catch (e: any) {
        return `計算エラー: ${e instanceof Error ? e.message : String(e)}`;
      }
    });

    this.loadPlugins(); // プラグインをロード

    logger.info(`MCP Server started on ws://localhost:${port}`);

    this.wss.on("connection", (ws) => {
      logger.info("Client connected");

      ws.on("message", (message) => {
        this.handleMessage(ws, message.toString());
      });

      ws.on("close", () => {
        logger.info("Client disconnected");
      });

      ws.on("error", (error) => {
        logger.error("WebSocket error:", error);
      });
    });

    this.wss.on("error", (error) => {
      logger.error("WebSocket server error:", error);
    });
  }

  private registerTool(name: string, func: ToolFunction) {
    this.tools.set(name, func);
    logger.info(`Tool registered: ${name}`);
  }

  private async callTool(toolName: string, ...args: any[]): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    return tool(...args);
  }

  private loadPlugins() {
    if (!fs.existsSync(PLUGIN_DIR)) {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      logger.info(`Plugin directory created: ${PLUGIN_DIR}`);
      return;
    }

    const pluginFiles = fs
      .readdirSync(PLUGIN_DIR)
      .filter((file) => file.endsWith(".js"));

    for (const file of pluginFiles) {
      const pluginPath = path.join(PLUGIN_DIR, file);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const plugin = require(pluginPath);
        if (plugin.name && typeof plugin.handler === "function") {
          this.registerTool(plugin.name, plugin.handler);
        } else {
          logger.warn(
            `Invalid plugin format: ${file}. Must export 'name' and 'handler' function.`,
          );
        }
      } catch (e: any) {
        if (e instanceof Error) {
          logger.error(`Failed to load plugin ${file}:`, e.message);
        } else {
          logger.error(`Failed to load plugin ${file}:`, String(e));
        }
      }
    }
  }

  private async handleMessage(ws: WebSocket, message: string) {
    try {
      const request: JsonRpcRequest = JSON.parse(message);

      if (request.jsonrpc !== "2.0" || !request.method) {
        this.sendError(ws, request.id || null, -32600, "Invalid Request");
        return;
      }

      let result: any;
      switch (request.method) {
        case "initialize":
          result = { capabilities: {} }; // Basic capabilities for now
          this.sendResponse(ws, request.id, result);
          // Send initialized notification
          this.sendNotification(ws, "initialized", {});
          break;
        case "roots/list":
          result = { roots: [] }; // No roots for now
          this.sendResponse(ws, request.id, result);
          break;
        case "orchestrate/task": // 新しいメソッド: オーケストレーションタスクの開始
          const userPrompt = request.params.prompt;
          const taskId = `task-${Date.now()}`;
          this.tasks.set(taskId, {
            id: taskId,
            prompt: userPrompt,
            status: "pending",
          });

          this.runOrchestration(taskId, userPrompt, ws) // WebSocketを渡して進捗を通知できるようにする
            .then((finalResponse) => {
              this.sendResponse(ws, request.id, {
                response: finalResponse,
                taskId: taskId,
              });
              this.tasks.get(taskId)!.status = "completed";
            })
            .catch((error) => {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              logger.error(`Orchestration failed for task ${taskId}:`, error);
              this.sendError(
                ws,
                request.id,
                -32000,
                `Orchestration failed: ${errorMessage}`,
              );
              this.tasks.get(taskId)!.status = "failed";
              this.sendNotification(ws, "task_status_update", {
                taskId,
                status: "failed",
                message: `Orchestration failed: ${errorMessage}`,
              });
            });
          break;
        default:
          this.sendError(
            ws,
            request.id,
            -32601,
            `Method not found: ${request.method}`,
          );
          break;
      }
    } catch (error) {
      logger.error("Error parsing message or handling request:", error);
      this.sendError(ws, null, -32700, "Parse error");
    }
  }

  private async runOrchestration(
    taskId: string,
    userPrompt: string,
    ws: WebSocket,
  ): Promise<string> {
    const task = this.tasks.get(taskId)!;
    task.status = "orchestrating";
    this.sendNotification(ws, "task_status_update", {
      taskId,
      status: task.status,
      message:
        "Role graph orchestration started (coordinator/developer/reviewer/documenter).",
    });

    const dispatchTask = new DispatchTaskUseCase();
    const roleGraph = new RunRoleGraphUseCase(
      dispatchTask,
      (role, prompt) => this.executeRole(role, prompt, taskId, ws),
      async (event) => {
        this.sendRoleDelegationNotification(ws, taskId, event);
        try {
          await this.writeRoleDelegationLog(taskId, event);
        } catch (error: any) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `Role delegation audit log write failed for task ${taskId}:`,
            message,
          );
          this.sendNotification(ws, "task_status_update", {
            taskId,
            status: event.status,
            message: `Audit log write failed: ${message}`,
            auditLogError: true,
          });
        }
      },
    );

    const result = await roleGraph.execute(userPrompt);
    task.status = "completed";
    task.roleComposition = result.tasks.map((roleTask) => roleTask.role);
    task.delegationEvents = result.events;
    task.finalResponse = result.finalResponse;
    this.sendNotification(ws, "task_status_update", {
      taskId,
      status: task.status,
      message: `Role execution completed: ${task.roleComposition.join(" -> ")}`,
    });

    return result.finalResponse;
  }

  private async executeRole(
    role: RoleName,
    prompt: string,
    taskId: string,
    ws: WebSocket,
  ): Promise<string> {
    const client =
      role === "documenter" ? this.orchestratorLLM : this.workerLLM;
    const messages: Message[] = [
      {
        role: "system",
        content: this.getRolePrompt(role),
      },
      {
        role: "user",
        content: prompt,
      },
    ];
    let output = "";
    for await (const chunk of client.chat("llama2", messages)) {
      if (chunk.message?.content) {
        output += chunk.message.content;
      }
    }

    const toolCallMatch = output.match(/CALL_TOOL\(([^,]+),\s*(.*)\)/);
    if (!toolCallMatch) {
      return output;
    }
    const toolName = toolCallMatch[1].trim();
    const toolArgs = toolCallMatch[2].trim();
    this.sendNotification(ws, "task_status_update", {
      taskId,
      status: "working",
      message: `Role ${role} requested tool: ${toolName}(${toolArgs})`,
    });
    try {
      const toolResult = await this.callTool(toolName, toolArgs);
      return `${output}\n\nTool result: ${toolResult}`;
    } catch (e: any) {
      const toolError = e instanceof Error ? e.message : String(e);
      return `${output}\n\nTool error: ${toolError}`;
    }
  }

  private getRolePrompt(role: RoleName): string {
    if (role === "developer") {
      return "You are developer role. Produce implementation-focused output in concise Japanese.";
    }
    if (role === "reviewer") {
      return "You are reviewer role. Validate risks and correctness in concise Japanese.";
    }
    if (role === "documenter") {
      return "You are documenter role. Produce final user-facing answer in concise Japanese.";
    }
    return "You are coordinator role.";
  }

  private sendRoleDelegationNotification(
    ws: WebSocket,
    taskId: string,
    event: RoleDelegationEvent,
  ) {
    const message =
      event.status === "failed"
        ? `Delegated to ${event.delegated_role} failed: ${event.failure_reason ?? "unknown error"}`
        : `Delegated to ${event.delegated_role} completed`;
    this.sendNotification(ws, "task_status_update", {
      taskId,
      parentTaskId: event.parent_task_id,
      childTaskId: event.task_id,
      status: event.status,
      delegatedRole: event.delegated_role,
      delegatedAt: event.delegated_at,
      resultAt: event.result_at,
      failureReason: event.failure_reason,
      message,
    });
  }

  private async writeRoleDelegationLog(
    taskId: string,
    event: RoleDelegationEvent,
  ): Promise<void> {
    await writeChatEventLog({
      timestamp: new Date().toISOString(),
      session_id: taskId,
      event_type: "role_delegation",
      parent_task_id: event.parent_task_id,
      child_task_id: event.task_id,
      delegated_role: event.delegated_role,
      delegated_at: event.delegated_at,
      result_at: event.result_at,
      failure_reason: event.failure_reason,
    });
  }

  private sendResponse(ws: WebSocket, id: string | number, result: any) {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id, result };
    ws.send(JSON.stringify(response));
  }

  private sendError(
    ws: WebSocket,
    id: string | number | null,
    code: number,
    message: string,
    data?: any,
  ) {
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    };
    ws.send(JSON.stringify(response));
  }

  private sendNotification(ws: WebSocket, method: string, params: any) {
    const notification = { jsonrpc: "2.0", method, params };
    ws.send(JSON.stringify(notification));
  }

  public close() {
    this.wss.close();
  }
}
