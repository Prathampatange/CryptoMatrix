/**
 * Analytics Engine — pure functions operating on price arrays.
 * All functions accept an array of numbers (most recent last).
 */

/**
 * Simple Moving Average over `period` data points.
 */
const sma = (prices, period) => {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((sum, p) => sum + p, 0) / period;
};

/**
 * Exponential Moving Average — gives more weight to recent prices.
 */
const ema = (prices, period) => {
    if (prices.length < period) return null;
    const k = 2 / (period + 1);
    let emaValue = sma(prices.slice(0, period), period);
    for (let i = period; i < prices.length; i++) {
        emaValue = prices[i] * k + emaValue * (1 - k);
    }
    return parseFloat(emaValue.toFixed(4));
};

/**
 * Full EMA series — returns an array of EMA values for charting/MACD.
 */
const emaSeries = (prices, period) => {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const result = [];
    let emaValue = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
    result.push(emaValue);
    for (let i = period; i < prices.length; i++) {
        emaValue = prices[i] * k + emaValue * (1 - k);
        result.push(emaValue);
    }
    return result;
};

/**
 * Historical Volatility — standard deviation of log returns (%).
 */
const volatility = (prices) => {
    if (prices.length < 2) return 0;
    const logReturns = [];
    for (let i = 1; i < prices.length; i++) {
        logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }
    const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
    const variance =
        logReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) /
        (logReturns.length - 1);
    return parseFloat((Math.sqrt(variance) * 100).toFixed(4));
};

/**
 * Percentage change between first and last price.
 */
const percentageChange = (prices) => {
    if (prices.length < 2) return 0;
    return parseFloat((((prices[prices.length - 1] - prices[0]) / prices[0]) * 100).toFixed(4));
};

// ═══════════════════════════════════════════════════════════════
// NEW: MACD — Moving Average Convergence/Divergence (12/26/9)
// ═══════════════════════════════════════════════════════════════

/**
 * MACD — standard 12/26/9 configuration.
 * Returns { macdLine, signalLine, histogram, signal }
 *   signal: 'BULLISH', 'BEARISH', or 'NEUTRAL'
 */
const macd = (prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
    if (prices.length < slowPeriod + signalPeriod) return null;

    const emaFast = emaSeries(prices, fastPeriod);
    const emaSlow = emaSeries(prices, slowPeriod);

    // Align: emaSlow starts later than emaFast
    const offset = slowPeriod - fastPeriod;
    const macdSeries = [];
    for (let i = 0; i < emaSlow.length; i++) {
        macdSeries.push(emaFast[i + offset] - emaSlow[i]);
    }

    if (macdSeries.length < signalPeriod) return null;

    // Signal line = EMA of MACD line
    const k = 2 / (signalPeriod + 1);
    let signalValue = macdSeries.slice(0, signalPeriod).reduce((s, v) => s + v, 0) / signalPeriod;
    const signalSeries = [signalValue];
    for (let i = signalPeriod; i < macdSeries.length; i++) {
        signalValue = macdSeries[i] * k + signalValue * (1 - k);
        signalSeries.push(signalValue);
    }

    const latestMACD = macdSeries[macdSeries.length - 1];
    const latestSignal = signalSeries[signalSeries.length - 1];
    const histogram = latestMACD - latestSignal;

    // Previous values for crossover detection
    const prevMACD = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2] : latestMACD;
    const prevSignal = signalSeries.length > 1 ? signalSeries[signalSeries.length - 2] : latestSignal;

    let signal = 'NEUTRAL';
    if (prevMACD <= prevSignal && latestMACD > latestSignal) signal = 'BULLISH';
    else if (prevMACD >= prevSignal && latestMACD < latestSignal) signal = 'BEARISH';
    else if (latestMACD > latestSignal && histogram > 0) signal = 'BULLISH';
    else if (latestMACD < latestSignal && histogram < 0) signal = 'BEARISH';

    return {
        macdLine: +latestMACD.toFixed(4),
        signalLine: +latestSignal.toFixed(4),
        histogram: +histogram.toFixed(4),
        signal,
    };
};

// ═══════════════════════════════════════════════════════════════
// NEW: Bollinger Bands — 20-period, 2 standard deviations
// ═══════════════════════════════════════════════════════════════

/**
 * Bollinger Bands.
 * Returns { upper, middle, lower, percentB, bandwidth, signal }
 *   percentB: where price sits within bands (0 = lower, 1 = upper, >1 = above upper)
 *   signal: 'OVERBOUGHT', 'OVERSOLD', 'NEUTRAL'
 */
const bollingerBands = (prices, period = 20, multiplier = 2) => {
    if (prices.length < period) return null;

    const slice = prices.slice(-period);
    const middle = slice.reduce((s, p) => s + p, 0) / period;
    const variance = slice.reduce((s, p) => s + Math.pow(p - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = middle + multiplier * stdDev;
    const lower = middle - multiplier * stdDev;
    const latest = prices[prices.length - 1];
    const bandwidth = ((upper - lower) / middle) * 100;

    // %B — where price sits within the bands
    const percentB = stdDev > 0 ? (latest - lower) / (upper - lower) : 0.5;

    let signal = 'NEUTRAL';
    if (percentB > 1) signal = 'OVERBOUGHT';
    else if (percentB > 0.8) signal = 'UPPER_BAND';
    else if (percentB < 0) signal = 'OVERSOLD';
    else if (percentB < 0.2) signal = 'LOWER_BAND';

    return {
        upper: +upper.toFixed(4),
        middle: +middle.toFixed(4),
        lower: +lower.toFixed(4),
        percentB: +percentB.toFixed(4),
        bandwidth: +bandwidth.toFixed(4),
        latest,
        signal,
    };
};

// ═══════════════════════════════════════════════════════════════
// NEW: Stochastic RSI — momentum oscillator (0–1 range)
// ═══════════════════════════════════════════════════════════════

/**
 * RSI calculation (needed for Stochastic RSI).
 */
const rsiSeries = (prices, period = 14) => {
    if (prices.length < period + 1) return [];
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
        changes.push(prices[i] - prices[i - 1]);
    }

    const result = [];
    let avgGain = 0, avgLoss = 0;

    // Initial averages
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));

    // Smoothed RSI
    for (let i = period; i < changes.length; i++) {
        const gain = changes[i] > 0 ? changes[i] : 0;
        const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
    }
    return result;
};

/**
 * Stochastic RSI — applies Stochastic formula to RSI values.
 * Returns { stochRSI, signal }
 *   stochRSI: 0–1 range (>0.8 overbought, <0.2 oversold)
 */
const stochasticRSI = (prices, rsiPeriod = 14, stochPeriod = 14) => {
    const rsiValues = rsiSeries(prices, rsiPeriod);
    if (rsiValues.length < stochPeriod) return null;

    const recentRSI = rsiValues.slice(-stochPeriod);
    const minRSI = Math.min(...recentRSI);
    const maxRSI = Math.max(...recentRSI);
    const latestRSI = rsiValues[rsiValues.length - 1];

    const stochRSI = maxRSI === minRSI ? 0.5 : (latestRSI - minRSI) / (maxRSI - minRSI);

    let signal = 'NEUTRAL';
    if (stochRSI > 0.8) signal = 'OVERBOUGHT';
    else if (stochRSI < 0.2) signal = 'OVERSOLD';

    return {
        stochRSI: +stochRSI.toFixed(4),
        rsi: +latestRSI.toFixed(2),
        signal,
    };
};

/**
 * Compute all indicators for a set of price records from MongoDB.
 */
const computeAll = (records) => {
    const prices = records.map((r) => r.price_usd);

    return {
        sma_10: sma(prices, 10),
        sma_20: sma(prices, 20),
        ema_10: ema(prices, 10),
        ema_20: ema(prices, 20),
        volatility: volatility(prices),
        change_pct: percentageChange(prices),
        latest: prices[prices.length - 1] ?? null,
        dataPoints: prices.length,
        macd: macd(prices),
        bollingerBands: bollingerBands(prices),
        stochasticRSI: stochasticRSI(prices),
    };
};

module.exports = {
    sma, ema, emaSeries, volatility, percentageChange,
    macd, bollingerBands, rsiSeries, stochasticRSI,
    computeAll,
};