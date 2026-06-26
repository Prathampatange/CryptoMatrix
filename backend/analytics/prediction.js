/**
 * AI Prediction Engine — Multi-Model Ensemble
 *
 * Uses 5 models weighted by reliability, plus MACD/Bollinger/StochRSI
 * for a composite confidence score that reflects real prediction quality.
 */

const { SLR: SimpleLinearRegression, PolynomialRegression } = require('ml-regression');
const ss = require('simple-statistics');
const { sma, ema, macd, bollingerBands, stochasticRSI, volatility } = require('./indicators');

// ═══════════════════════════════════════════════════════════════
// MODEL 1: Linear Regression (baseline)
// ═══════════════════════════════════════════════════════════════
const linearModel = (prices, steps) => {
    const X = prices.map((_, i) => i);
    const reg = new SimpleLinearRegression(X, prices);
    const lastIdx = prices.length - 1;
    const preds = [];
    for (let i = 1; i <= steps; i++) preds.push(reg.predict(lastIdx + i));

    // R²
    const predicted = X.map(x => reg.predict(x));
    const ssTot = ss.sum(prices.map(y => Math.pow(y - ss.mean(prices), 2)));
    const ssRes = ss.sum(prices.map((y, i) => Math.pow(y - predicted[i], 2)));
    const r2 = Math.max(0, 1 - ssRes / ssTot);

    return { predictions: preds, r2, slope: reg.slope, name: 'Linear' };
};

// ═══════════════════════════════════════════════════════════════
// MODEL 2: Polynomial (Quadratic) Regression
// ═══════════════════════════════════════════════════════════════
const quadraticModel = (prices, steps) => {
    const X = prices.map((_, i) => i);
    const reg = new PolynomialRegression(X, prices, 2);
    const lastIdx = prices.length - 1;
    const preds = [];
    for (let i = 1; i <= steps; i++) preds.push(reg.predict(lastIdx + i));

    // R² for poly
    const predicted = X.map(x => reg.predict(x));
    const ssTot = ss.sum(prices.map(y => Math.pow(y - ss.mean(prices), 2)));
    const ssRes = ss.sum(prices.map((y, i) => Math.pow(y - predicted[i], 2)));
    const r2 = Math.max(0, 1 - ssRes / ssTot);

    return { predictions: preds, r2, name: 'Quadratic' };
};

// ═══════════════════════════════════════════════════════════════
// MODEL 3: EMA Extrapolation — project EMA trend forward
// ═══════════════════════════════════════════════════════════════
const emaModel = (prices, steps) => {
    const ema10 = ema(prices, 10);
    const ema20 = ema(prices, 20);
    if (ema10 === null || ema20 === null) return null;

    // Trend = difference between fast and slow EMA as velocity
    const velocity = (ema10 - ema20) / ema20;
    const latest = prices[prices.length - 1];
    const preds = [];
    for (let i = 1; i <= steps; i++) {
        // Decay velocity over time (mean-reverting tendency)
        const decayedVel = velocity * Math.pow(0.85, i);
        preds.push(latest * (1 + decayedVel * i * 0.1));
    }

    // Confidence: based on how consistent the EMA trend has been
    const recentPrices = prices.slice(-20);
    const emaLatest = ema10;
    const deviation = Math.abs(latest - emaLatest) / emaLatest;
    const r2 = Math.max(0, 1 - deviation * 5); // closer to EMA = higher confidence

    return { predictions: preds, r2, velocity, name: 'EMA Trend' };
};

// ═══════════════════════════════════════════════════════════════
// MODEL 4: Momentum — recent velocity with decay
// ═══════════════════════════════════════════════════════════════
const momentumModel = (prices, steps) => {
    if (prices.length < 10) return null;

    // Calculate recent momentum (weighted toward most recent)
    const recent = prices.slice(-10);
    let totalMomentum = 0;
    let totalWeight = 0;
    for (let i = 1; i < recent.length; i++) {
        const change = (recent[i] - recent[i - 1]) / recent[i - 1];
        const weight = i; // more recent = higher weight
        totalMomentum += change * weight;
        totalWeight += weight;
    }
    const avgMomentum = totalMomentum / totalWeight;

    const latest = prices[prices.length - 1];
    const preds = [];
    for (let i = 1; i <= steps; i++) {
        // Momentum with exponential decay
        const decayed = avgMomentum * Math.pow(0.8, i);
        preds.push(latest * (1 + decayed * i));
    }

    // Confidence: momentum consistency
    const changes = recent.slice(1).map((p, i) => (p - recent[i]) / recent[i]);
    const allSameDir = changes.every(c => c >= 0) || changes.every(c => c <= 0);
    const r2 = allSameDir ? 0.7 : 0.3;

    return { predictions: preds, r2, momentum: avgMomentum, name: 'Momentum' };
};

// ═══════════════════════════════════════════════════════════════
// MODEL 5: Mean Reversion — pull toward SMA-20
// ═══════════════════════════════════════════════════════════════
const meanReversionModel = (prices, steps) => {
    const sma20 = sma(prices, 20);
    if (sma20 === null) return null;

    const latest = prices[prices.length - 1];
    const deviation = (latest - sma20) / sma20;

    const preds = [];
    for (let i = 1; i <= steps; i++) {
        // Gradually revert toward SMA-20
        const revertFactor = 1 - deviation * (i / (steps * 2));
        preds.push(latest * revertFactor);
    }

    // Confidence: higher when price is far from mean (reversion more likely)
    const r2 = Math.min(0.8, Math.abs(deviation) * 3 + 0.2);

    return { predictions: preds, r2, deviation, name: 'Mean Reversion' };
};

// ═══════════════════════════════════════════════════════════════
// ENSEMBLE: Combine all models with weighted averaging
// ═══════════════════════════════════════════════════════════════

const WEIGHTS = {
    'Linear': 0.15,
    'Quadratic': 0.25,
    'EMA Trend': 0.20,
    'Momentum': 0.20,
    'Mean Reversion': 0.20,
};

const ensembleForecast = (prices, steps = 10) => {
    if (prices.length < 20) return null;

    // Run all models
    const models = [
        linearModel(prices, steps),
        quadraticModel(prices, steps),
        emaModel(prices, steps),
        momentumModel(prices, steps),
        meanReversionModel(prices, steps),
    ].filter(Boolean);

    if (models.length === 0) return null;

    // Weighted ensemble prediction
    const totalWeight = models.reduce((s, m) => s + (WEIGHTS[m.name] || 0.2), 0);
    const ensemblePredictions = [];

    for (let step = 0; step < steps; step++) {
        let weightedSum = 0;
        models.forEach(m => {
            const w = (WEIGHTS[m.name] || 0.2) / totalWeight;
            weightedSum += m.predictions[step] * w;
        });
        ensemblePredictions.push(+weightedSum.toFixed(4));
    }

    // Compute confidence bands from model disagreement
    const upper = [];
    const lower = [];
    for (let step = 0; step < steps; step++) {
        const modelPreds = models.map(m => m.predictions[step]);
        const std = modelPreds.length > 1 ? ss.standardDeviation(modelPreds) : 0;
        upper.push(+(ensemblePredictions[step] + 1.5 * std).toFixed(4));
        lower.push(+(ensemblePredictions[step] - 1.5 * std).toFixed(4));
    }

    // ── Composite Confidence Score ──
    // Factor 1: Best model R² (40%)
    const bestR2 = Math.max(...models.map(m => m.r2));

    // Factor 2: Directional agreement (30%)
    const latest = prices[prices.length - 1];
    const bullishCount = models.filter(m => m.predictions[0] > latest).length;
    const agreementRatio = Math.max(bullishCount, models.length - bullishCount) / models.length;

    // Factor 3: Volatility penalty (30%) — high volatility = lower confidence
    const vol = volatility(prices);
    const volPenalty = Math.max(0, 1 - vol / 5); // vol > 5% → heavy penalty

    const compositeConfidence = +(
        bestR2 * 0.4 +
        agreementRatio * 0.3 +
        volPenalty * 0.3
    ).toFixed(4);

    // Overall trend direction
    const trendVotes = models.reduce((sum, m) => {
        return sum + (m.predictions[steps - 1] > latest ? 1 : -1);
    }, 0);
    const trend = trendVotes > 0 ? 'BULLISH' : trendVotes < 0 ? 'BEARISH' : 'NEUTRAL';

    // Best model slope for display
    const linearSlope = models.find(m => m.name === 'Linear')?.slope || 0;

    return {
        predictions: ensemblePredictions,
        confidence: Math.max(0, Math.min(1, compositeConfidence)),
        upper,
        lower,
        trend,
        slope: +linearSlope.toFixed(6),
        models: models.map(m => ({
            name: m.name,
            r2: +m.r2.toFixed(4),
            weight: WEIGHTS[m.name] || 0.2,
            nextPrice: +m.predictions[0].toFixed(4),
        })),
        agreement: +(agreementRatio * 100).toFixed(1),
        volatilityPenalty: +((1 - volPenalty) * 100).toFixed(1),
    };
};

// ═══════════════════════════════════════════════════════════════
// Moving Average Crossover Signal
// ═══════════════════════════════════════════════════════════════
const crossoverSignal = (prices) => {
    const short = sma(prices, 10);
    const long = sma(prices, 20);
    if (!short || !long) return 'NEUTRAL';
    if (short > long) return 'BUY';
    if (short < long) return 'SELL';
    return 'NEUTRAL';
};

// ═══════════════════════════════════════════════════════════════
// RSI (14-period)
// ═══════════════════════════════════════════════════════════════
const rsi = (prices, period = 14) => {
    if (prices.length < period + 1) return null;
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
        changes.push(prices[i] - prices[i - 1]);
    }
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;
    // Smoothed
    for (let i = period; i < changes.length; i++) {
        const gain = changes[i] > 0 ? changes[i] : 0;
        const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return +(100 - 100 / (1 + rs)).toFixed(2);
};

// ═══════════════════════════════════════════════════════════════
// Full Prediction Report
// ═══════════════════════════════════════════════════════════════
const generateReport = (records) => {
    const prices = records.map((r) => r.price_usd);

    const macdResult = macd(prices);
    const bbResult = bollingerBands(prices);
    const stochResult = stochasticRSI(prices);
    const rsiVal = rsi(prices, 14);

    // Count bullish/bearish signals for overall recommendation
    let bullish = 0, bearish = 0;
    const forecast = ensembleForecast(prices, 10);

    if (forecast?.trend === 'BULLISH') bullish++; else if (forecast?.trend === 'BEARISH') bearish++;
    if (macdResult?.signal === 'BULLISH') bullish++; else if (macdResult?.signal === 'BEARISH') bearish++;
    if (bbResult?.signal === 'OVERSOLD' || bbResult?.signal === 'LOWER_BAND') bullish++;
    else if (bbResult?.signal === 'OVERBOUGHT' || bbResult?.signal === 'UPPER_BAND') bearish++;
    if (stochResult?.signal === 'OVERSOLD') bullish++;
    else if (stochResult?.signal === 'OVERBOUGHT') bearish++;
    if (rsiVal !== null && rsiVal < 30) bullish++;
    else if (rsiVal !== null && rsiVal > 70) bearish++;

    const overallSignal = bullish > bearish + 1 ? 'STRONG_BUY'
        : bullish > bearish ? 'BUY'
        : bearish > bullish + 1 ? 'STRONG_SELL'
        : bearish > bullish ? 'SELL'
        : 'HOLD';

    return {
        forecast,
        signal: crossoverSignal(prices),
        rsi: rsiVal,
        rsiSignal: rsiVal === null ? 'INSUFFICIENT_DATA'
            : rsiVal > 70 ? 'OVERBOUGHT'
            : rsiVal < 30 ? 'OVERSOLD'
            : 'NEUTRAL',
        macd: macdResult,
        bollingerBands: bbResult,
        stochasticRSI: stochResult,
        overallSignal,
        signalBreakdown: { bullish, bearish, total: bullish + bearish },
    };
};

module.exports = { ensembleForecast, crossoverSignal, rsi, generateReport };