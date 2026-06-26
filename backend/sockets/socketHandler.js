const { fetchSentiment } = require('../services/sentiment');

let io;
let latestMarkets = [];

const init = (socketIO) => {
    io = socketIO;
    io.on('connection', async (socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // Send sentiment on first connect
        const sentiment = await fetchSentiment();
        socket.emit('sentiment_update', sentiment);

        // Instantly send cached markets data if available to avoid 30s delay
        if (latestMarkets.length > 0) {
            socket.emit('market_update', {
                markets: latestMarkets,
                timestamp: new Date(),
            });
        }

        socket.on('subscribe', (symbol) => socket.join(symbol.toUpperCase()));
        socket.on('disconnect', () => console.log(`🔌 Disconnected: ${socket.id}`));
    });
};

const broadcast = (ticks, analyticsMap, alerts, anomalyMap = {}, markets = []) => {
    if (!io) return;

    if (markets.length > 0) {
        latestMarkets = markets;
    }

    // ── Build market ticks — never let price_usd / price_inr be 0 ──
    // If one currency value is missing, derive it from the other using
    // the stored usd_inr_rate (or the fallback 83.5).
    const marketTicks = latestMarkets.map(m => {
        const rate = m.usd_inr_rate || 83.5;
        const priceUsd = m.price_usd
            || (m.price_inr ? +(m.price_inr / rate).toFixed(4) : 0);
        const priceInr = m.price_inr
            || (m.price_usd ? +(m.price_usd * rate).toFixed(4) : 0);

        return {
            symbol: m.id,
            name: m.name,
            price_usd: priceUsd,
            price_inr: priceInr,
            price_change_pct_24h: m.change_pct || 0,
            volume_24h: m.volume || 0,
        };
    });

    io.emit('price_update', {
        ticks: [...ticks, ...marketTicks],
        analyticsMap,
        anomalyMap,
        timestamp: new Date(),
    });

    if (markets.length > 0) {
        io.emit('market_update', {
            markets,
            timestamp: new Date(),
        });
    }

    ticks.forEach((tick) => {
        io.to(tick.symbol).emit('coin_update', {
            tick,
            analytics: analyticsMap[tick.symbol] || {},
            anomaly: anomalyMap[tick.symbol] || {},
        });
    });

    if (alerts.length > 0) io.emit('alerts', alerts);
};

// Broadcast market data independently (called by the market polling loop)
const broadcastMarkets = (markets) => {
    if (!io) return;
    latestMarkets = markets;
    io.emit('market_update', {
        markets,
        timestamp: new Date(),
    });
};

// Broadcast sentiment every 5 minutes
const startSentimentBroadcast = () => {
    setInterval(async () => {
        if (!io) return;
        const sentiment = await fetchSentiment();
        io.emit('sentiment_update', sentiment);
    }, 5 * 60 * 1000);
};

module.exports = { init, broadcast, broadcastMarkets, startSentimentBroadcast };