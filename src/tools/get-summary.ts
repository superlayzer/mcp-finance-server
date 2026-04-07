import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchSummaryData } from "../yahoo-finance.js";

const SUMMARY_WIDGET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }

  .container { padding: 16px; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 4px;
  }
  .ticker { font-size: 18px; font-weight: 600; }
  .asset-name { font-size: 12px; opacity: 0.6; margin-left: 8px; }
  .price { font-size: 24px; font-weight: 700; }
  .change { font-size: 14px; margin-left: 8px; }
  .positive { color: #22c55e; }
  .negative { color: #ef4444; }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 24px;
  }
  .stat {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid var(--grid);
    font-size: 13px;
  }
  .stat-label { opacity: 0.6; }
  .stat-value { font-weight: 500; }

  .loading { text-align: center; padding: 48px; opacity: 0.5; font-size: 14px; }
  .error { text-align: center; padding: 48px; color: #ef4444; font-size: 14px; }

  body.dark { background: #0a0a0a; color: #f5f5f5; --grid: #27272a; }
  body.light { background: #fff; color: #111; --grid: #e5e7eb; }
  body:not(.dark):not(.light) { background: #0a0a0a; color: #f5f5f5; --grid: #27272a; }
</style>
</head>
<body>
  <div class="container">
    <div id="loading" class="loading">Loading summary...</div>
    <div id="error" class="error" style="display:none"></div>
    <div id="content" style="display:none">
      <div class="header">
        <div>
          <span class="ticker" id="ticker"></span>
          <span class="asset-name" id="asset-name"></span>
        </div>
        <div style="text-align:right">
          <span class="price" id="price"></span>
          <span class="change" id="change"></span>
        </div>
      </div>
      <div class="stats" id="stats"></div>
    </div>
  </div>
<script>
(function () {
  var summaryData = null;
  var theme = "dark";

  function postToHost(msg) {
    window.parent.postMessage(msg, "*");
  }

  function formatVolume(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toString();
  }

  function formatPrice(price, currency) {
    var sym = currency === "USD" ? "$" : currency + " ";
    return sym + price.toFixed(2);
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.jsonrpc !== "2.0") return;

    if (data.id === 1 && data.result) {
      if (data.result.hostContext && data.result.hostContext.theme) {
        theme = data.result.hostContext.theme;
        document.body.className = theme;
      }
      return;
    }

    if (data.method === "ui/notifications/initialized") return;
    if (data.method === "ui/notifications/tool-input") return;

    if (data.method === "ui/notifications/host-context-changed") {
      if (data.params && data.params.theme) {
        theme = data.params.theme;
        document.body.className = theme;
      }
      return;
    }

    if (data.method === "ui/notifications/tool-result") {
      try {
        var params = data.params;
        var parsed;

        if (params && params.result && params.result.content) {
          var tc = params.result.content.find(function (c) { return c.type === "text"; });
          if (tc) parsed = JSON.parse(tc.text);
        } else if (params && params.content) {
          var tc2 = params.content.find(function (c) { return c.type === "text"; });
          if (tc2) parsed = JSON.parse(tc2.text);
        }

        if (parsed && parsed.ticker) {
          summaryData = parsed;
          render();
        } else {
          showError("No summary data received");
        }
      } catch (err) {
        showError("Failed to parse summary data: " + err.message);
      }
      return;
    }
  });

  setTimeout(function () {
    postToHost({
      jsonrpc: "2.0",
      id: 1,
      method: "ui/initialize",
      params: {
        protocolVersion: "2026-01-26",
        capabilities: {},
        clientInfo: { name: "summary-widget", version: "1.0.0" },
      },
    });
  }, 50);

  function showError(message) {
    document.getElementById("loading").style.display = "none";
    var el = document.getElementById("error");
    el.style.display = "block";
    el.textContent = message;
  }

  function render() {
    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";

    var d = summaryData;
    document.getElementById("ticker").textContent = d.ticker;
    document.getElementById("asset-name").textContent = d.name;

    var fp = formatPrice;
    document.getElementById("price").textContent = fp(d.currentPrice, d.currency);

    var changeEl = document.getElementById("change");
    var sign = d.change >= 0 ? "+" : "";
    changeEl.textContent = sign + d.change.toFixed(2) + " (" + sign + d.changePercent.toFixed(2) + "%)";
    changeEl.className = "change " + (d.change >= 0 ? "positive" : "negative");

    var stats = [
      ["Day Range", fp(d.dayLow, d.currency) + " \\u2014 " + fp(d.dayHigh, d.currency)],
      ["52W Range", fp(d.fiftyTwoWeekLow, d.currency) + " \\u2014 " + fp(d.fiftyTwoWeekHigh, d.currency)],
      ["Volume", formatVolume(d.volume)],
      ["Prev Close", fp(d.previousClose, d.currency)],
      ["Exchange", d.exchange],
    ];

    var statsEl = document.getElementById("stats");
    statsEl.innerHTML = stats.map(function (s) {
      return '<div class="stat"><span class="stat-label">' + s[0] + '</span><span class="stat-value">' + s[1] + '</span></div>';
    }).join("");

    postToHost({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 220 } });
  }
})();
</script>
</body>
</html>`;

export function registerGetSummary(server: McpServer): void {
  server.registerTool(
    "get_summary",
    {
      title: "Stock & Crypto Summary",
      description:
        "Get a detailed summary of a stock or cryptocurrency including current price, day range, 52-week range, volume and exchange info. Use tickers like AAPL, MSFT, BTC-USD.",
      inputSchema: {
        ticker: z
          .string()
          .describe("Stock or crypto ticker symbol (e.g. AAPL, BTC-USD)"),
      },
      _meta: { ui: { resourceUri: "ui://chart/summary-widget.html" } },
    },
    async ({ ticker }) => {
      try {
        const data = await fetchSummaryData(ticker);
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
                err instanceof Error ? err.message : "Failed to fetch summary",
            },
          ],
        };
      }
    },
  );

  server.registerResource(
    "summary-widget",
    "ui://chart/summary-widget.html",
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: "ui://chart/summary-widget.html",
          text: SUMMARY_WIDGET_HTML,
          mimeType: "text/html;profile=mcp-app",
        },
      ],
    }),
  );
}
