require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const portfolioRoutes = require('./routes/portfolio');
const { fetchPrices } = require('./services/fetcher');
const { fetchMarkets } = require('./services/marketFetcher');
const { evaluate } = require('./services/alertService');
const { computeAll } = require('./analytics/indicators');
const { detectAll } = require('./analytics/anomaly');
const socketHandler = require('./sockets/socketHandler');
const { startSentimentBroadcast } = require('./sockets/socketHandler');
const Price = require('./models/Price');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Routes ─────────────────────────────────────────────────
app.use('/api', apiRoutes);
app.use('/api/portfolio', portfolioRoutes);

// Catch-all — serve frontend
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Socket.io ──────────────────────────────────────────────
socketHandler.init(io);

// ── Crypto pipeline ────────────────────────────────────────
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'];

const runPipeline = async () => {
    const ticks = await fetchPrices();
    if (!ticks.length) return;

    const analyticsMap = {};
    const anomalyMap = {};

    await Promise.all(
        SYMBOLS.map(async (symbol) => {
            const records = await Price.find({ symbol })
                .sort({ timestamp: -1 })
                .limit(50)
                .lean();
            const sorted = records.reverse();
            analyticsMap[symbol] = computeAll(sorted);
            anomalyMap[symbol] = detectAll(sorted);
        })
    );

    const alerts = evaluate(ticks, analyticsMap);

    Object.entries(anomalyMap).forEach(([symbol, result]) => {
        if (result.isAnomaly) {
            alerts.push({
                type: 'ANOMALY_DETECTED',
                symbol,
                message: `${symbol}: ${result.summary}`,
                severity: result.zScore?.severity || 'WARNING',
                timestamp: new Date(),
            });
        }
    });

    socketHandler.broadcast(ticks, analyticsMap, alerts, anomalyMap);

    console.log(
        `[${new Date().toISOString()}] Pipeline: ${ticks.length} coins updated`,
        alerts.length ? `| ⚠️  ${alerts.length} alert(s)` : ''
    );
};

// ── Market pipeline ────────────────────────────────────────
const runMarketPipeline = async () => {
    try {
        const markets = await fetchMarkets();
        if (markets.length) {
            socketHandler.broadcastMarkets(markets);
            console.log(`[${new Date().toISOString()}] Markets: ${markets.length} instruments updated`);
        }
    } catch (err) {
        console.error('Market pipeline error:', err.message);
    }
};

// ── Startup ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
    runPipeline();
    setInterval(runPipeline, parseInt(process.env.FETCH_INTERVAL_MS) || 20000);

    runMarketPipeline();
    setInterval(runMarketPipeline, 30000);

    startSentimentBroadcast();

    server.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
});