const THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD_PERCENT) || 5;

const evaluate = (ticks, analyticsMap) => {
    return ticks.flatMap((tick) => {
        const alerts = [];
        const { symbol, price_usd, tick_change_pct } = tick;
        const analytics = analyticsMap[symbol] || {};

        if (Math.abs(tick_change_pct) >= THRESHOLD) {
            alerts.push({
                type: 'PRICE_SPIKE',
                symbol,
                message: `${symbol} moved ${tick_change_pct > 0 ? '+' : ''}${tick_change_pct.toFixed(2)}% in one tick`,
                price_usd,
                severity: Math.abs(tick_change_pct) >= THRESHOLD * 2 ? 'HIGH' : 'MEDIUM',
                timestamp: new Date(),
            });
        }

        if (analytics.volatility > 3) {
            alerts.push({
                type: 'VOLATILITY_SPIKE',
                symbol,
                message: `${symbol} volatility at ${analytics.volatility.toFixed(2)}%`,
                price_usd,
                severity: analytics.volatility > 6 ? 'HIGH' : 'MEDIUM',
                timestamp: new Date(),
            });
        }

        return alerts;
    });
};

module.exports = { evaluate };