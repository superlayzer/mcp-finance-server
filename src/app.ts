import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerGetChart } from "./tools/get-chart.js";
import { registerGetSummary } from "./tools/get-summary.js";
import { registerCompareTickers } from "./tools/compare-tickers.js";
import { registerGetMovers } from "./tools/get-movers.js";

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "mcp-finance-server", version: "1.0.0" },
    { capabilities: { logging: {} } },
  );

  registerGetChart(server);
  registerGetSummary(server);
  registerCompareTickers(server);
  registerGetMovers(server);

  return server;
}

type Bindings = {
  MCP_API_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "mcp-session-id",
      "Last-Event-ID",
      "mcp-protocol-version",
    ],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
  }),
);

app.get("/", (c) => c.json({ name: "mcp-finance-server", version: "1.0.0" }));

/**
 * Timing-safe string comparison to prevent
 * timing attacks on API key validation.
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Optional API key authentication.
// Set MCP_API_KEY env var to require Bearer token auth.
// If not set, the server is open access.
app.use("/mcp", async (c, next) => {
  const apiKey = c.env.MCP_API_KEY ?? process.env.MCP_API_KEY;
  if (!apiKey) return next();

  const auth = c.req.header("Authorization");
  if (!safeCompare(auth ?? "", `Bearer ${apiKey}`)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

app.all("/mcp", async (c) => {
  const { req, res } = toReqRes(c.req.raw);
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(
    req,
    res,
    await c.req.json().catch(() => undefined),
  );
  return toFetchResponse(res);
});

export default app;
