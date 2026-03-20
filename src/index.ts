import { randomUUID } from "crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

// ── Config ────────────────────────────────────────────────────────────────────

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const MCP_BEARER_TOKEN = process.env.MCP_BEARER_TOKEN;
const PORT = parseInt(process.env.MCP_PORT ?? "3000", 10);

if (!CF_API_TOKEN) throw new Error("CF_API_TOKEN is required");
if (!CF_ACCOUNT_ID) throw new Error("CF_ACCOUNT_ID is required");
if (!MCP_BEARER_TOKEN) throw new Error("MCP_BEARER_TOKEN is required");

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireBearer(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const auth = req.headers["authorization"];
  if (!auth || auth !== `Bearer ${MCP_BEARER_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Session store ─────────────────────────────────────────────────────────────

const transports = new Map<string, StreamableHTTPServerTransport>();

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health check — no auth required, no sensitive info exposed
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// MCP endpoint — bearer token required
app.post("/mcp", requireBearer, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport!);
      },
    });
    const server = createServer(CF_API_TOKEN!, CF_ACCOUNT_ID!);
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", requireBearer, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports.get(sessionId);
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  await transport.handleRequest(req, res);
});

app.delete("/mcp", requireBearer, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports.get(sessionId);
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  await transport.handleRequest(req, res);
  transports.delete(sessionId);
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`cloudflare-admin MCP server listening on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
