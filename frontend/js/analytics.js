/**
 * Client-side analytics helpers — mirrors the backend indicators.js
 * Useful for computing indicators on locally-buffered data without
 * an extra API call.
 */

const ClientAnalytics = (() => {
    const sma = (arr, period) => {
        if (arr.length < period) return null;
        const slice = arr.slice(-period).filter((v) => v != null);
        return slice.reduce((s, v) => s + v, 0) / slice.length;
    };

    const ema = (arr, period) => {
        const clean = arr.filter((v) => v != null);
        if (clean.length < period) return null;
        const k = 2 / (period + 1);
        let val = sma(clean.slice(0, period), period);
        for (let i = period; i < clean.length; i++) val = clean[i] * k + val * (1 - k);
        return val;
    };

    const volatility = (arr) => {
        const clean = arr.filter((v) => v != null);
        if (clean.length < 2) return 0;
        const returns = [];
        for (let i = 1; i < clean.length; i++) returns.push(Math.log(clean[i] / clean[i - 1]));
        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
        return Math.sqrt(variance) * 100;
    };

    return { sma, ema, volatility };
})();