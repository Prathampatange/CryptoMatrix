const ss = require('simple-statistics');

/**
 * Anomaly Detection Engine
 * Uses Z-score method and IQR (interquartile range) to flag unusual price moves.
 * An anomaly is flagged when price deviates significantly from recent behaviour.
 */

/**
 * Z-score anomaly detection.
 * Z-score = (value - mean) / stdDev
 * Values with |Z| > threshold are anomalies.
 *
 * @param {number[]} prices
 * @param {number}   threshold - standard deviations to flag (default 2.5)
 * @returns {object} anomaly analysis
 */
const zScoreDetect = (prices, threshold = 2.5) => {
    if (prices.length < 10) return { isAnomaly: false, reason: 'insufficient data' };

    const mean = ss.mean(prices);
    const stdDev = ss.standardDeviation(prices);
    const latest = prices[prices.length - 1];

    if (stdDev === 0) return { isAnomaly: false, zScore: 0 };

    const zScore = (latest - mean) / stdDev;

    return {
        isAnomaly: Math.abs(zScore) > threshold,
        zScore: parseFloat(zScore.toFixed(4)),
        mean: parseFloat(mean.toFixed(4)),
        stdDev: parseFloat(stdDev.toFixed(4)),
        latest,
        direction: zScore > 0 ? 'HIGH' : 'LOW',
        severity: Math.abs(zScore) > threshold * 1.5 ? 'CRITICAL'
            : Math.abs(zScore) > threshold ? 'WARNING'
                : 'NORMAL',
    };
};

/**
 * IQR (Interquartile Range) anomaly detection.
 * Flags values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR] as outliers.
 * More robust than Z-score for skewed distributions.
 */
const iqrDetect = (prices) => {
    if (prices.length < 10) return { isAnomaly: false };

    const sorted = [...prices].sort((a, b) => a - b);
    const q1 = ss.quantile(sorted, 0.25);
    const q3 = ss.quantile(sorted, 0.75);
    const iqr = q3 - q1;

    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const latest = prices[prices.length - 1];

    return {
        isAnomaly: latest < lowerFence || latest > upperFence,
        latest,
        lowerFence: parseFloat(lowerFence.toFixed(4)),
        upperFence: parseFloat(upperFence.toFixed(4)),
        q1: parseFloat(q1.toFixed(4)),
        q3: parseFloat(q3.toFixed(4)),
    };
};

/**
 * Volume spike detection — flags when volume is unusually high.
 * Often precedes large price moves.
 */
const volumeAnomaly = (volumes) => {
    if (volumes.length < 5) return { isAnomaly: false };
    const mean = ss.mean(volumes);
    const stdDev = ss.standardDeviation(volumes);
    const latest = volumes[volumes.length - 1];
    const zScore = stdDev > 0 ? (latest - mean) / stdDev : 0;

    return {
        isAnomaly: zScore > 2,
        zScore: parseFloat(zScore.toFixed(4)),
        multiplier: parseFloat((latest / mean).toFixed(2)), // e.g. "3.2x normal volume"
    };
};

/**
 * Full anomaly report for one coin.
 */
const detectAll = (records) => {
    const prices = records.map((r) => r.price_usd);
    const volumes = records.map((r) => r.volume_24h);

    const zResult = zScoreDetect(prices);
    const iqResult = iqrDetect(prices);
    const volResult = volumeAnomaly(volumes);

    // Combine signals — flag if any method agrees
    const isAnomaly = zResult.isAnomaly || iqResult.isAnomaly || volResult.isAnomaly;

    return {
        isAnomaly,
        zScore: zResult,
        iqr: iqResult,
        volume: volResult,
        summary: isAnomaly
            ? `Anomaly detected (Z=${zResult.zScore}, Vol×${volResult.multiplier})`
            : 'No anomaly detected',
    };
};

module.exports = { zScoreDetect, iqrDetect, volumeAnomaly, detectAll };