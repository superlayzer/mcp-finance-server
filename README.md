# mcp-finance-server

MCP server for stock and cryptocurrency financial data with interactive UI widgets.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

## What is this?

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to real-time financial data from Yahoo Finance. Tools render interactive charts and data cards via the [ext-apps](https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/ext-apps) UI standard.

Works with any MCP client: [Layzer](https://layzer.ai), Claude Desktop, or your own application.

## Tools

| Tool | Description | UI Widget |
|------|-------------|:---------:|
| `get_chart` | Price chart for a stock or cryptocurrency | Canvas chart |
| `get_summary` | Key stats: price, range, volume, exchange | Data card |
| `compare_tickers` | Compare 2-3 tickers by % change | Multi-line chart |
| `get_movers` | Today's top 3 gainers and losers | Two-column list |

## Quick start

```bash
git clone https://github.com/superlayzer/mcp-finance-server.git
cd mcp-finance-server
npm install
npm run dev
```

Server runs at `http://localhost:3004/mcp`.

## Register in an MCP client

Add the server URL `http://localhost:3004/mcp` to any MCP-compatible client.

**Layzer:** Account > MCP Servers > Add Server

**Claude Desktop:** Add to `claude_desktop_config.json`:

```json
{ "mcpServers": { "finance": { "url": "http://localhost:3004/mcp" } } }
```

## Deploy to Cloudflare Workers

```bash
npx wrangler login
npm run deploy
```

Your server URL: `https://mcp-finance-server.<your-subdomain>.workers.dev/mcp`

## Example prompts

- "Show me Apple's stock price this month"
- "Get a summary of Tesla"
- "Compare AAPL vs MSFT vs GOOGL over the last year"
- "What are today's market movers?"
- "Chart Bitcoin over the last 3 months"
- "Compare BTC-USD and ETH-USD this week"

## Supported tickers

**Stocks:** AAPL, GOOGL, MSFT, TSLA, AMZN, META, NVDA, JPM, BAC, GS, and any valid Yahoo Finance ticker.

**Crypto:** BTC-USD, ETH-USD, SOL-USD, and any `-USD` pair.

**ETFs:** SPY, QQQ, and any valid ETF ticker.

Data sourced from Yahoo Finance (no API key required).

## How to add a new tool

Create `src/tools/my-tool.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerMyTool(server: McpServer): void {
  server.registerTool(
    "my_tool",
    {
      title: "My Tool",
      description: "What this tool does",
      inputSchema: {
        query: z.string().describe("The input"),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text" as const, text: JSON.stringify({ result: query }) }],
    }),
  );
}
```

Register in `src/app.ts`:

```typescript
import { registerMyTool } from "./tools/my-tool.js";
registerMyTool(server);
```

To add a UI widget, set `_meta.ui.resourceUri` on the tool and register a resource with self-contained HTML. See `src/tools/chart-widget.ts` for a complete example.

## The ext-apps UI protocol

Widgets run in sandboxed iframes and communicate via `postMessage` using JSON-RPC 2.0:

1. Widget sends `ui/initialize` to get the host theme
2. Host sends `ui/notifications/tool-result` with tool output
3. Widget renders and sends `ui/notifications/size-changed`

See the [ext-apps spec](https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/ext-apps) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
