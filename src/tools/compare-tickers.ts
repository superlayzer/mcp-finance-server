import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchChartData } from "../yahoo-finance.js";
import type { ChartData } from "../yahoo-finance.js";

interface CompareSeries {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number;
  periodChangePercent: number;
  dataPoints: Array<{ timestamp: number; percentChange: number }>;
}

interface CompareData {
  period: string;
  series: CompareSeries[];
  errors: string[];
}

function normaliseToPercentChange(data: ChartData): CompareSeries {
  const points = data.dataPoints.filter((p) => p.close !== null);
  const basePrice = points[0]?.close ?? 1;

  return {
    ticker: data.ticker,
    name: data.name,
    currency: data.currency,
    currentPrice: data.currentPrice,
    periodChangePercent:
      points.length > 0
        ? (((points[points.length - 1]!.close as number) - basePrice) /
            basePrice) *
          100
        : 0,
    dataPoints: points.map((p) => ({
      timestamp: p.timestamp,
      percentChange: (((p.close as number) - basePrice) / basePrice) * 100,
    })),
  };
}

const COMPARE_WIDGET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }

  .container { padding: 16px; }
  .title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
  .legend {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .legend-pct { font-weight: 500; }
  .positive { color: #22c55e; }
  .negative { color: #ef4444; }

  .chart-wrap { position: relative; }
  canvas { display: block; width: 100%; }
  .tooltip {
    position: absolute;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    display: none;
    white-space: nowrap;
    z-index: 1;
    line-height: 1.6;
  }

  .loading { text-align: center; padding: 48px; opacity: 0.5; font-size: 14px; }
  .error { text-align: center; padding: 48px; color: #ef4444; font-size: 14px; }

  body.dark { background: #0a0a0a; color: #f5f5f5; --grid: #27272a; --sub: rgba(245, 245, 245, 0.4); }
  body.light { background: #fff; color: #111; --grid: #e5e7eb; --sub: rgba(17, 17, 17, 0.4); }
  body:not(.dark):not(.light) { background: #0a0a0a; color: #f5f5f5; --grid: #27272a; --sub: rgba(245, 245, 245, 0.4); }
</style>
</head>
<body>
  <div class="container">
    <div id="loading" class="loading">Loading comparison...</div>
    <div id="error" class="error" style="display:none"></div>
    <div id="content" style="display:none">
      <div class="title" id="title"></div>
      <div class="legend" id="legend"></div>
      <div class="chart-wrap">
        <canvas id="canvas"></canvas>
        <div class="tooltip" id="tooltip"></div>
      </div>
    </div>
  </div>
<script>
(function () {
  var compareData = null;
  var theme = "dark";
  var COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6"];

  function postToHost(msg) {
    window.parent.postMessage(msg, "*");
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
        if (compareData) drawChart();
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

        if (parsed && parsed.series && parsed.series.length >= 2) {
          compareData = parsed;
          drawChart();
        } else {
          showError("Not enough data to compare");
        }
      } catch (err) {
        showError("Failed to parse comparison data: " + err.message);
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
        clientInfo: { name: "compare-widget", version: "1.0.0" },
      },
    });
  }, 50);

  function showError(message) {
    document.getElementById("loading").style.display = "none";
    var el = document.getElementById("error");
    el.style.display = "block";
    el.textContent = message;
  }

  function drawChart() {
    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";

    var series = compareData.series;
    document.getElementById("title").textContent =
      series.map(function (s) { return s.ticker; }).join(" vs ") + " — " + compareData.period;

    // Legend
    var legendEl = document.getElementById("legend");
    legendEl.innerHTML = series.map(function (s, i) {
      var sign = s.periodChangePercent >= 0 ? "+" : "";
      var cls = s.periodChangePercent >= 0 ? "positive" : "negative";
      return '<div class="legend-item">' +
        '<span class="legend-dot" style="background:' + COLORS[i] + '"></span>' +
        '<span>' + s.ticker + '</span>' +
        '<span class="legend-pct ' + cls + '">' + sign + s.periodChangePercent.toFixed(1) + '%</span>' +
        '</div>';
    }).join("");

    // Canvas setup
    var canvas = document.getElementById("canvas");
    var dpr = window.devicePixelRatio || 1;
    var width = canvas.parentElement.clientWidth;
    var height = 260;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Find global min/max % across all series
    var allPcts = [];
    var maxLen = 0;
    series.forEach(function (s) {
      s.dataPoints.forEach(function (p) { allPcts.push(p.percentChange); });
      if (s.dataPoints.length > maxLen) maxLen = s.dataPoints.length;
    });
    var minPct = Math.min.apply(null, allPcts);
    var maxPct = Math.max.apply(null, allPcts);
    var pctPad = Math.max((maxPct - minPct) * 0.1, 1);
    minPct -= pctPad;
    maxPct += pctPad;
    var pctRange = maxPct - minPct || 1;

    var pad = { t: 10, b: 30, l: 0, r: 55 };
    var chartWidth = width - pad.l - pad.r;
    var chartHeight = height - pad.t - pad.b;

    function xOf(i) { return pad.l + (i / (maxLen - 1)) * chartWidth; }
    function yOf(v) { return pad.t + chartHeight - ((v - minPct) / pctRange) * chartHeight; }

    var styles = getComputedStyle(document.documentElement);
    var gridColor = styles.getPropertyValue("--grid").trim() || "#27272a";
    var subColor = styles.getPropertyValue("--sub").trim() || "rgba(245, 245, 245, 0.4)";

    // Grid lines and % labels
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (var g = 0; g < 5; g++) {
      var gridY = pad.t + (chartHeight / 4) * g;
      ctx.beginPath();
      ctx.moveTo(pad.l, gridY);
      ctx.lineTo(width - pad.r, gridY);
      ctx.stroke();

      var label = (maxPct - (pctRange / 4) * g).toFixed(1) + "%";
      ctx.fillStyle = subColor;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, width - pad.r + 4, gridY + 3);
    }

    // Zero reference line (dashed)
    if (minPct <= 0 && maxPct >= 0) {
      var zeroY = yOf(0);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = subColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, zeroY);
      ctx.lineTo(width - pad.r, zeroY);
      ctx.stroke();
      ctx.restore();
    }

    // Draw each series line
    series.forEach(function (s, si) {
      var pts = s.dataPoints;
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(pts[0].percentChange));
      for (var i = 1; i < pts.length; i++) {
        ctx.lineTo(xOf(i), yOf(pts[i].percentChange));
      }
      ctx.strokeStyle = COLORS[si];
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // X-axis date labels
    var refSeries = series[0].dataPoints;
    var labelCount = Math.min(5, refSeries.length);
    ctx.fillStyle = subColor;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    for (var li = 0; li < labelCount; li++) {
      var idx = Math.floor((li / (labelCount - 1)) * (refSeries.length - 1));
      var date = new Date(refSeries[idx].timestamp * 1000);
      var dateLabel = (date.getMonth() + 1) + "/" + date.getDate();
      ctx.fillText(dateLabel, xOf(idx), height - 6);
    }

    // Tooltip
    var tooltip = document.getElementById("tooltip");
    canvas.onmousemove = function (e) {
      var rect = canvas.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var idx = Math.round(((mouseX - pad.l) / chartWidth) * (maxLen - 1));
      idx = Math.max(0, Math.min(maxLen - 1, idx));

      var refPt = series[0].dataPoints[idx];
      if (!refPt) return;
      var date = new Date(refPt.timestamp * 1000);
      var lines = [date.toLocaleDateString()];
      series.forEach(function (s, si) {
        var pt = s.dataPoints[idx];
        if (pt) {
          var sign = pt.percentChange >= 0 ? "+" : "";
          lines.push('<span style="color:' + COLORS[si] + '">' + s.ticker + ': ' + sign + pt.percentChange.toFixed(1) + '%</span>');
        }
      });

      tooltip.style.display = "block";
      var tipX = xOf(idx);
      tooltip.style.left = Math.min(tipX - 60, width - 160) + "px";
      tooltip.style.top = "10px";
      tooltip.innerHTML = lines.join("<br>");
    };
    canvas.onmouseleave = function () {
      tooltip.style.display = "none";
    };

    postToHost({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 400 } });
  }
})();
</script>
</body>
</html>`;

export function registerCompareTickers(server: McpServer): void {
  server.registerTool(
    "compare_tickers",
    {
      title: "Compare Stocks & Crypto",
      description:
        "Compare 2 or 3 stocks or cryptocurrencies on the same chart showing percentage change over time. Use tickers like AAPL, MSFT, BTC-USD. Shows relative performance so different-priced assets are comparable.",
      inputSchema: {
        tickers: z
          .array(z.string())
          .min(2)
          .max(3)
          .describe("2-3 ticker symbols to compare (e.g. ['AAPL', 'MSFT'])"),
        period: z
          .enum(["1D", "1W", "1M", "3M", "1Y"])
          .default("1M")
          .describe("Time period for comparison"),
      },
      _meta: { ui: { resourceUri: "ui://chart/compare-widget.html" } },
    },
    async ({ tickers, period }) => {
      try {
        const results = await Promise.allSettled(
          tickers.map((t) => fetchChartData(t, period ?? "1M")),
        );

        const successful: ChartData[] = [];
        const errors: string[] = [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i]!;
          if (result.status === "fulfilled") {
            successful.push(result.value);
          } else {
            errors.push(
              `${tickers[i]}: ${result.reason instanceof Error ? result.reason.message : "Failed"}`,
            );
          }
        }

        if (successful.length < 2) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Need at least 2 tickers to compare. Errors: ${errors.join(", ")}`,
              },
            ],
          };
        }

        const data: CompareData = {
          period: period ?? "1M",
          series: successful.map(normaliseToPercentChange),
          errors,
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
                  : "Failed to fetch comparison data",
            },
          ],
        };
      }
    },
  );

  server.registerResource(
    "compare-widget",
    "ui://chart/compare-widget.html",
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: "ui://chart/compare-widget.html",
          text: COMPARE_WIDGET_HTML,
          mimeType: "text/html;profile=mcp-app",
        },
      ],
    }),
  );
}
