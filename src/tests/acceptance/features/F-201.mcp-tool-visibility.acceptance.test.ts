import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { McpServer } from "../../../mcp/McpServer";

describe("F-201 MCP tool visibility acceptance", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "f201-mcp-"));
    process.env.CHAT_EVENT_LOG_FILE = path.join(tempDir, "chat-events.jsonl");
  });

  afterEach(async () => {
    delete process.env.CHAT_EVENT_LOG_FILE;
    await fsp.rm(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it("records which MCP tool was used and whether it succeeded", async () => {
    const server = Object.create(McpServer.prototype) as any;
    server.tools = new Map([["calculator", jest.fn().mockResolvedValue("ok")]]);
    server.toolCallCounts = new Map();
    server.config = {
      getMcpToolStates: jest.fn().mockResolvedValue({
        calculator: true,
      }),
    };

    await server.callTool("calculator", "1+1");

    const content = await fsp.readFile(
      process.env.CHAT_EVENT_LOG_FILE!,
      "utf-8",
    );
    expect(content).toContain('"event_type":"mcp_tool_call"');
    expect(content).toContain('"mcp_tool_name":"calculator"');
    expect(content).toContain('"mcp_server_name":"local-control-node"');
    expect(content).toContain('"mcp_success":true');
  });
});
