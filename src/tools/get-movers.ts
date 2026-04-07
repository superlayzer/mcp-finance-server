import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchChartData } from "../yahoo-finance.js";

export const MAJOR_TICKERS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "NVDA",
  "TSLA",
  "JPM",
  "BAC",
  "GS",
  "JNJ",
  "WMT",
  "XOM",
  "V",
  "MA",
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "SPY",
  "QQQ",
];

interface MoverEntry {
  ticker: string;
  name: string;
  currentPrice: number;
  changePercent: number;
  currency: string;
}

interface MoversData {
  gainers: MoverEntry[];
  losers: MoverEntry[];
  asOf: string;
  tickersFailed: number;
}

const MOVERS_WIDGET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }

  .container { padding: 16px; }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }
  .column { padding: 0 12px; }
  .column:first-child { border-right: 1px solid var(--grid); padding-left: 0; }
  .column:last-child { padding-right: 0; }
  .col-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .col-title-gain { color: #22c55e; }
  .col-title-lose { color: #ef4444; }

  .entry { margin-bottom: 12px; }
  .entry-row1 {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .entry-ticker { font-weight: 600; font-size: 14px; }
  .entry-pct { font-weight: 600; font-size: 14px; }
  .entry-name { font-size: 11px; opacity: 0.5; margin-top: 1px; }
  .entry-price { font-size: 11px; opacity: 0.5; }
  .positive { color: #22c55e; }
  .negative { color: #ef4444; }

  .footer {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--grid);
    font-size: 11px;
    opacity: 0.4;
  }

  .loading { text-align: center; padding: 48px; opacity: 0.5; font-size: 14px; }
  .error { text-align: center; padding: 48px; color: #ef4444; font-size: 14px; }

  body.dark { background: #0a0a0a; color: #f5f5f5; --grid: #27272a; }
  body.light { background: #fff; color: #111; --grid: #e5e7eb; }
  body:not(.dark):not(.light) { background: #0a0a0a; color: #f5f5f5; --grid: #27272a; }
</style>
</head>
<body>
  <div class="container">
    <div id="loading" class="loading">Loading market movers...</div>
    <div id="error" class="error" style="display:none"></div>
    <div id="content" style="display:none">
      <div class="columns">
        <div class="column">
          <div class="col-title col-title-gain">\\u25B2 Top Gainers</div>
          <div id="gainers"></div>
        </div>
        <div class="column">
          <div class="col-title col-title-lose">\\u25BC Top Losers</div>
          <div id="losers"></div>
        </div>
      </div>
      <div class="footer" id="footer"></div>
    </div>
  </div>
<script>
(function () {
  var theme = "dark";

  function postToHost(msg) {
    window.parent.postMessage(msg, "*");
  }

  function formatPrice(price, currency) {
    var sym = currency === "USD" ? "$" : currency + " ";
    return sym + price.toFixed(2);
  }

  function renderEntries(containerId, entries, isGainer) {
    var el = document.getElementById(containerId);
    el.innerHTML = entries.map(function (e) {
      var sign = e.changePercent >= 0 ? "+" : "";
      var cls = isGainer ? "positive" : "negative";
      return '<div class="entry">' +
        '<div class="entry-row1">' +
          '<span class="entry-ticker">' + e.ticker + '</span>' +
          '<span class="entry-pct ' + cls + '">' + sign + e.changePercent.toFixed(2) + '%</span>' +
        '</div>' +
        '<div class="entry-name">' + e.name + '</div>' +
        '<div class="entry-price">' + formatPrice(e.currentPrice, e.currency) + '</div>' +
      '</div>';
    }).join("");
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

        if (parsed && parsed.gainers) {
          document.getElementById("loading").style.display = "none";
          document.getElementById("content").style.display = "block";

          renderEntries("gainers", parsed.gainers, true);
          renderEntries("losers", parsed.losers, false);

          var footerParts = [];
          if (parsed.asOf) {
            footerParts.push("Updated: " + new Date(parsed.asOf).toLocaleTimeString());
          }
          if (parsed.tickersFailed > 0) {
            footerParts.push(parsed.tickersFailed + " ticker" + (parsed.tickersFailed > 1 ? "s" : "") + " unavailable");
          }
          document.getElementById("footer").textContent = footerParts.join(" \\u00B7 ");

          postToHost({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 320 } });
        } else {
          showError("No movers data received");
        }
      } catch (err) {
        showError("Failed to parse movers data: " + err.message);
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
        clientInfo: { name: "movers-widget", version: "1.0.0" },
      },
    });
  }, 50);

  function showError(message) {
    document.getElementById("loading").style.display = "none";
    var el = document.getElementById("error");
    el.style.display = "block";
    el.textContent = message;
  }
})();
</script>
</body>
</html>`;

export function registerGetMovers(server: McpServer): void {
  server.registerTool(
    "get_movers",
    {
      title: "Market Movers",
      description:
        "Show today's top 3 gainers and top 3 losers from major US stocks and cryptocurrencies. No input required — always returns current market movers.",
      inputSchema: {},
      _meta: { ui: { resourceUri: "ui://chart/movers-widget.html" } },
    },
    async () => {
      try {
        const results = await Promise.allSettled(
          MAJOR_TICKERS.map((t) => fetchChartData(t, "1D")),
        );

        const entries: MoverEntry[] = [];
        let tickersFailed = 0;

        for (const result of results) {
          if (result.status === "fulfilled") {
            const d = result.value;
            entries.push({
              ticker: d.ticker,
              name: d.name,
              currentPrice: d.currentPrice,
              changePercent: d.changePercent,
              currency: d.currency,
            });
          } else {
            tickersFailed++;
          }
        }

        if (entries.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Unable to fetch market data. Please try again later.",
              },
            ],
          };
        }

        entries.sort((a, b) => b.changePercent - a.changePercent);

        const data: MoversData = {
          gainers: entries.slice(0, 3),
          losers: entries.slice(-3).reverse(),
          asOf: new Date().toISOString(),
          tickersFailed,
        };

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
                err instanceof Error
                  ? err.message
                  : "Failed to fetch market movers",
            },
          ],
        };
      }
    },
  );

  server.registerResource(
    "movers-widget",
    "ui://chart/movers-widget.html",
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: "ui://chart/movers-widget.html",
          text: MOVERS_WIDGET_HTML,
          mimeType: "text/html;profile=mcp-app",
        },
      ],
    }),
  );
}
