import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchChartData } from "../yahoo-finance.js";
import { CHART_WIDGET_HTML } from "./chart-widget.js";

export function registerGetChart(server: McpServer): void {
  server.registerTool(
    "get_chart",
    {
      title: "Stock & Crypto Chart",
      description:
        "Get a stock or cryptocurrency price chart. Use stock tickers like AAPL, GOOGL, MSFT, TSLA or crypto tickers like BTC-USD, ETH-USD, SOL-USD. Returns an interactive chart with price history.",
      inputSchema: {
        ticker: z
          .string()
          .describe("Stock or crypto ticker (e.g. AAPL, BTC-USD, TSLA)"),
        period: z
          .enum(["1D", "1W", "1M", "3M", "1Y"])
          .default("1M")
          .describe("Time period for the chart"),
      },
      _meta: { ui: { resourceUri: "ui://chart/widget.html" } },
    },
    async ({ ticker, period }) => {
      try {
        const data = await fetchChartData(ticker, period ?? "1M");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                err instanceof Error ? err.message : "Failed to fetch chart",
            },
          ],
        };
      }
    },
  );

  server.registerResource(
    "chart-widget",
    "ui://chart/widget.html",
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: "ui://chart/widget.html",
          text: CHART_WIDGET_HTML,
          mimeType: "text/html;profile=mcp-app",
        },
      ],
    }),
  );
}
