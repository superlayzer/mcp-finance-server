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

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "mcp-session-id",
      "Last-Event-ID",
      "mcp-protocol-version",
    ],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
  }),
);

app.get("/", (c) => c.json({ name: "mcp-finance-server", version: "1.0.0" }));

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
