export interface ChartData {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  period: string;
  dataPoints: Array<{
    timestamp: number;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
  }>;
}

export interface SummaryData {
  ticker: string;
  name: string;
  currency: string;
  exchange: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volume: number;
}

interface YahooFinanceMeta {
  symbol: string;
  longName?: string;
  shortName?: string;
  currency: string;
  regularMarketPrice: number;
  chartPreviousClose: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  fullExchangeName?: string;
}

interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: YahooFinanceMeta;
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: Array<number | null>;
          high: Array<number | null>;
          low: Array<number | null>;
          close: Array<number | null>;
          volume: Array<number | null>;
        }>;
      };
    }> | null;
    error: { description: string } | null;
  };
}

const PERIOD_MAP: Record<string, { interval: string; range: string }> = {
  "1D": { interval: "5m", range: "1d" },
  "1W": { interval: "15m", range: "5d" },
  "1M": { interval: "1d", range: "1mo" },
  "3M": { interval: "1d", range: "3mo" },
  "1Y": { interval: "1wk", range: "1y" },
};

interface YahooQuote {
  open: Array<number | null>;
  high: Array<number | null>;
  low: Array<number | null>;
  close: Array<number | null>;
  volume: Array<number | null>;
}

async function fetchYahooChart(
  ticker: string,
  interval: string,
  range: string,
): Promise<{ meta: YahooFinanceMeta; timestamp: number[]; quote: YahooQuote }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance returned ${res.status} for ${ticker}`);
  }

  const json = (await res.json()) as YahooFinanceResponse;

  if (json.chart.error) {
    throw new Error(json.chart.error.description);
  }

  const result = json.chart.result?.[0];
  if (!result) {
    throw new Error(`No data found for ticker ${ticker}`);
  }

  const quote = result.indicators.quote[0];
  if (!quote || !result.timestamp) {
    throw new Error(`No price data for ${ticker}`);
  }

  return { meta: result.meta, timestamp: result.timestamp, quote };
}

export async function fetchChartData(
  ticker: string,
  period: string,
): Promise<ChartData> {
  const mapping = PERIOD_MAP[period];
  if (!mapping) {
    throw new Error(`Invalid period: ${period}`);
  }

  const { meta, timestamp, quote } = await fetchYahooChart(
    ticker,
    mapping.interval,
    mapping.range,
  );

  const currentPrice = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose;
  const change = currentPrice - previousClose;
  const changePercent = (change / previousClose) * 100;

  const dataPoints = timestamp
    .map((ts, i) => ({
      timestamp: ts,
      open: quote.open[i] ?? null,
      high: quote.high[i] ?? null,
      low: quote.low[i] ?? null,
      close: quote.close[i] ?? null,
      volume: quote.volume[i] ?? null,
    }))
    .filter((dp) => dp.close !== null);

  return {
    ticker: meta.symbol,
    name: meta.longName ?? meta.shortName ?? meta.symbol,
    currency: meta.currency,
    currentPrice,
    previousClose,
    change,
    changePercent,
    period,
    dataPoints,
  };
}

export async function fetchSummaryData(ticker: string): Promise<SummaryData> {
  const { meta } = await fetchYahooChart(ticker, "1d", "1d");

  const currentPrice = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose;
  const change = currentPrice - previousClose;
  const changePercent = (change / previousClose) * 100;

  return {
    ticker: meta.symbol,
    name: meta.longName ?? meta.shortName ?? meta.symbol,
    currency: meta.currency,
    exchange: meta.fullExchangeName ?? "Unknown",
    currentPrice,
    previousClose,
    change,
    changePercent,
    dayHigh: meta.regularMarketDayHigh ?? currentPrice,
    dayLow: meta.regularMarketDayLow ?? currentPrice,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? currentPrice,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? currentPrice,
    volume: meta.regularMarketVolume ?? 0,
  };
}
