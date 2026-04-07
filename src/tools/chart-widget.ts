export const CHART_WIDGET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  /* Reset */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }

  /* Layout */
  .container { padding: 16px; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 4px;
  }

  /* Typography */
  .ticker { font-size: 18px; font-weight: 600; }
  .asset-name { font-size: 12px; opacity: 0.6; margin-left: 8px; }
  .price { font-size: 24px; font-weight: 700; }
  .change { font-size: 14px; margin-left: 8px; }
  .positive { color: #22c55e; }
  .negative { color: #ef4444; }

  /* Chart */
  .chart-wrap { position: relative; }
  canvas { display: block; width: 100%; }
  .tooltip {
    position: absolute;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    display: none;
    white-space: nowrap;
    z-index: 1;
  }

  /* States */
  .loading { text-align: center; padding: 48px; opacity: 0.5; font-size: 14px; }
  .error { text-align: center; padding: 48px; color: #ef4444; font-size: 14px; }

  /* Theme */
  body.dark { background: #0a0a0a; color: #f5f5f5; --grid: #27272a; --sub: rgba(245, 245, 245, 0.4); }
  body.light { background: #fff; color: #111; --grid: #e5e7eb; --sub: rgba(17, 17, 17, 0.4); }
  body:not(.dark):not(.light) { background: #0a0a0a; color: #f5f5f5; --grid: #27272a; --sub: rgba(245, 245, 245, 0.4); }
</style>
</head>
<body>
  <div class="container">
    <div id="loading" class="loading">Loading chart...</div>
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
      <div class="chart-wrap">
        <canvas id="canvas"></canvas>
        <div class="tooltip" id="tooltip"></div>
      </div>
    </div>
  </div>
<script>
(function () {
  // --- State ---
  var chartData = null;
  var theme = "dark";

  // --- Utilities ---
  function postToHost(msg) {
    window.parent.postMessage(msg, "*");
  }

  // --- Message Handler ---
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.jsonrpc !== "2.0") return;

    // Handle initialize response from host
    if (data.id === 1 && data.result) {
      if (data.result.hostContext && data.result.hostContext.theme) {
        theme = data.result.hostContext.theme;
        document.body.className = theme;
      }
      return;
    }

    if (data.method === "ui/notifications/initialized") return;
    if (data.method === "ui/notifications/tool-input") return;

    // Handle theme changes from host
    if (data.method === "ui/notifications/host-context-changed") {
      if (data.params && data.params.theme) {
        theme = data.params.theme;
        document.body.className = theme;
        if (chartData) drawChart();
      }
      return;
    }

    // Handle tool result — parse chart data
    if (data.method === "ui/notifications/tool-result") {
      try {
        var params = data.params;
        var parsed;

        // Layzer wraps MCP results as { result: { content: [...] }, _mcpUi: {...} }
        if (params && params.result && params.result.content) {
          var textContent = params.result.content.find(function (c) { return c.type === "text"; });
          if (textContent) parsed = JSON.parse(textContent.text);
        }
        // Raw MCP format: { content: [...] }
        else if (params && params.content) {
          var textContent2 = params.content.find(function (c) { return c.type === "text"; });
          if (textContent2) parsed = JSON.parse(textContent2.text);
        }

        if (parsed && parsed.dataPoints) {
          chartData = parsed;
          drawChart();
        } else {
          showError("No chart data received");
        }
      } catch (err) {
        showError("Failed to parse chart data: " + err.message);
      }
      return;
    }
  });

  // --- Initialize ---
  // Delay to ensure the host's React useEffect has attached its message listener
  setTimeout(function () {
    postToHost({
      jsonrpc: "2.0",
      id: 1,
      method: "ui/initialize",
      params: {
        protocolVersion: "2026-01-26",
        capabilities: {},
        clientInfo: { name: "chart-widget", version: "1.0.0" },
      },
    });
  }, 50);

  // --- Error Display ---
  function showError(message) {
    document.getElementById("loading").style.display = "none";
    var el = document.getElementById("error");
    el.style.display = "block";
    el.textContent = message;
  }

  // --- Chart Rendering ---
  function drawChart() {
    // Update header
    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";
    document.getElementById("ticker").textContent = chartData.ticker;
    document.getElementById("asset-name").textContent = chartData.name;

    var currencySymbol = chartData.currency === "USD" ? "$" : chartData.currency + " ";
    document.getElementById("price").textContent = currencySymbol + chartData.currentPrice.toFixed(2);

    var changeEl = document.getElementById("change");
    var sign = chartData.change >= 0 ? "+" : "";
    changeEl.textContent = sign + chartData.change.toFixed(2) + " (" + sign + chartData.changePercent.toFixed(2) + "%)";
    changeEl.className = "change " + (chartData.change >= 0 ? "positive" : "negative");

    // Set up canvas with device pixel ratio scaling
    var canvas = document.getElementById("canvas");
    var dpr = window.devicePixelRatio || 1;
    var width = canvas.parentElement.clientWidth;
    var height = 220;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Calculate price range and coordinate transforms
    var dataPoints = chartData.dataPoints;
    var closePrices = dataPoints.map(function (p) { return p.close; });
    var minPrice = Math.min.apply(null, closePrices) * 0.998;
    var maxPrice = Math.max.apply(null, closePrices) * 1.002;
    var priceRange = maxPrice - minPrice || 1;

    var pad = { t: 10, b: 30, l: 0, r: 50 };
    var chartWidth = width - pad.l - pad.r;
    var chartHeight = height - pad.t - pad.b;

    function xOf(i) { return pad.l + (i / (dataPoints.length - 1)) * chartWidth; }
    function yOf(v) { return pad.t + chartHeight - ((v - minPrice) / priceRange) * chartHeight; }

    // Read theme colors from CSS variables
    var styles = getComputedStyle(document.documentElement);
    var gridColor = styles.getPropertyValue("--grid").trim() || "#27272a";
    var subColor = styles.getPropertyValue("--sub").trim() || "rgba(245, 245, 245, 0.4)";
    var lineColor = chartData.change >= 0 ? "#22c55e" : "#ef4444";
    var fillColor = chartData.change >= 0 ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)";

    // Draw horizontal grid lines and price labels
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (var g = 0; g < 4; g++) {
      var gridY = pad.t + (chartHeight / 3) * g;
      ctx.beginPath();
      ctx.moveTo(pad.l, gridY);
      ctx.lineTo(width - pad.r, gridY);
      ctx.stroke();

      var label = (maxPrice - (priceRange / 3) * g).toFixed(2);
      ctx.fillStyle = subColor;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, width - pad.r + 4, gridY + 3);
    }

    // Draw area fill under the price line
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(closePrices[0]));
    for (var i = 1; i < closePrices.length; i++) {
      ctx.lineTo(xOf(i), yOf(closePrices[i]));
    }
    ctx.lineTo(xOf(closePrices.length - 1), pad.t + chartHeight);
    ctx.lineTo(xOf(0), pad.t + chartHeight);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Draw the price line
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(closePrices[0]));
    for (var i = 1; i < closePrices.length; i++) {
      ctx.lineTo(xOf(i), yOf(closePrices[i]));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw x-axis date labels
    var labelCount = Math.min(5, dataPoints.length);
    ctx.fillStyle = subColor;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    for (var li = 0; li < labelCount; li++) {
      var idx = Math.floor((li / (labelCount - 1)) * (dataPoints.length - 1));
      var date = new Date(dataPoints[idx].timestamp * 1000);
      var dateLabel = (date.getMonth() + 1) + "/" + date.getDate();
      ctx.fillText(dateLabel, xOf(idx), height - 6);
    }

    // Set up hover tooltip
    var tooltip = document.getElementById("tooltip");
    canvas.onmousemove = function (e) {
      var rect = canvas.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var idx = Math.round(((mouseX - pad.l) / chartWidth) * (dataPoints.length - 1));
      idx = Math.max(0, Math.min(dataPoints.length - 1, idx));

      var point = dataPoints[idx];
      var date = new Date(point.timestamp * 1000);
      tooltip.style.display = "block";

      var tipX = xOf(idx);
      var tipY = yOf(point.close);
      tooltip.style.left = Math.min(tipX - 50, width - 120) + "px";
      tooltip.style.top = (tipY - 40) + "px";
      tooltip.innerHTML = date.toLocaleDateString() + "<br>" + currencySymbol + point.close.toFixed(2);
    };
    canvas.onmouseleave = function () {
      tooltip.style.display = "none";
    };

    // Notify host of final rendered size
    postToHost({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 300 } });
  }
})();
</script>
</body>
</html>`;
