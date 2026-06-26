/**
 * backend/routes/api.js
 * REST API — crypto prices, analytics, prediction, anomaly,
 * sentiment, markets, and currency rate.
 * Portfolio routes are handled separately in routes/portfolio.js
 */

const router = require('express').Router();

const Price = require('../models/Price');
const MarketData = require('../models/MarketData');

const { computeAll } = require('../analytics/indicators');
const { generateReport } = require('../analytics/prediction');
const { detectAll } = require('../analytics/anomaly');
const { fetchSentiment } = require('../services/sentiment');
const { fetchMarkets } = require('../services/marketFetcher');
const {
    getCachedRate,
    getCacheSource,
    getCacheUpdated,
    getUSDToINR,
} = require('../services/currencyService');

// ═══════════════════════════════════════════════════════════
// PREDICTION CACHE — 60-second TTL per symbol
// ═══════════════════════════════════════════════════════════
const PRED_CACHE_TTL = 60 * 1000; // 60 seconds
const predictionCache = new Map(); // key: `crypto:BTC` or `market:SENSEX`

const getCachedPrediction = (key) => {
    const entry = predictionCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > PRED_CACHE_TTL) {
        predictionCache.delete(key);
        return null;
    }
    return entry.data;
};

const setCachedPrediction = (key, data) => {
    predictionCache.set(key, { data, ts: Date.now() });
};

// ═══════════════════════════════════════════════════════════
// STATUS — data readiness check
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/status
 * Returns how many price records exist for each tracked symbol.
 * Used by the frontend to know when enough data has accumulated.
 */
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'];
const MARKET_IDS = ['SENSEX', 'NIFTY', 'GOLD', 'SILVER'];
const MIN_RECORDS = 10;

router.get('/status', async (req, res) => {
    try {
        const [cryptoCounts, marketCounts] = await Promise.all([
            Promise.all(
                CRYPTO_SYMBOLS.map(async (sym) => {
                    const count = await Price.countDocuments({ symbol: sym });
                    return { symbol: sym, count, ready: count >= MIN_RECORDS };
                })
            ),
            Promise.all(
                MARKET_IDS.map(async (id) => {
                    const count = await MarketData.countDocuments({ id });
                    return { symbol: id, count, ready: count >= MIN_RECORDS };
                })
            ),
        ]);

        const allReady = [...cryptoCounts, ...marketCounts].every(s => s.ready);
        res.json({
            success: true,
            allReady,
            minRequired: MIN_RECORDS,
            crypto: cryptoCounts,
            markets: marketCounts,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// CURRENCY
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/currency/rate
 * Returns live USD to INR exchange rate.
 */
router.get('/currency/rate', async (req, res) => {
    try {
        const rate = req.query.fresh === 'true'
            ? await getUSDToINR()
            : getCachedRate();

        res.json({
            success: true,
            usd_inr: rate,
            source: getCacheSource(),
            updated_at: getCacheUpdated(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// CRYPTO PRICES
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/coins
 * Latest price snapshot for all tracked coins.
 */
router.get('/coins', async (req, res) => {
    try {
        const latest = await Price.aggregate([
            { $sort: { timestamp: -1 } },
            { $group: { _id: '$symbol', doc: { $first: '$$ROOT' } } },
            { $replaceRoot: { newRoot: '$doc' } },
            { $sort: { market_cap: -1 } },
        ]);
        res.json({ success: true, data: latest });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/coins/:symbol/history?limit=100
 */
router.get('/coins/:symbol/history', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const records = await Price.find({ symbol: req.params.symbol.toUpperCase() })
            .sort({ timestamp: -1 })
            .limit(limit)
            .select('price_usd price_inr usd_inr_rate volume_24h timestamp -_id')
            .lean();
        res.json({ success: true, data: records.reverse() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/coins/:symbol/analytics?period=50
 */
router.get('/coins/:symbol/analytics', async (req, res) => {
    try {
        const period = Math.min(parseInt(req.query.period) || 50, 200);
        const records = await Price.find({ symbol: req.params.symbol.toUpperCase() })
            .sort({ timestamp: -1 })
            .limit(period)
            .lean();

        if (!records.length)
            return res.status(404).json({ success: false, error: 'No data found' });

        const analytics = computeAll(records.reverse());
        res.json({ success: true, symbol: req.params.symbol.toUpperCase(), analytics });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/coins/:symbol/predict
 */
router.get('/coins/:symbol/predict', async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const cacheKey = `crypto:${symbol}`;

        // Serve from cache if fresh
        const cached = getCachedPrediction(cacheKey);
        if (cached) return res.json(cached);

        const records = await Price.find({ symbol })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();

        if (records.length < MIN_RECORDS) {
            const secsLeft = Math.ceil((MIN_RECORDS - records.length) * 20); // ~20s per tick
            return res.status(202).json({
                success: false,
                notReady: true,
                error: `Only ${records.length} of ${MIN_RECORDS} required records found. Try again in ~${secsLeft}s.`,
                count: records.length,
                required: MIN_RECORDS,
            });
        }

        const report = generateReport(records.reverse());
        const response = { success: true, symbol, prediction: report };
        setCachedPrediction(cacheKey, response);
        res.json(response);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/coins/:symbol/anomaly
 */
router.get('/coins/:symbol/anomaly', async (req, res) => {
    try {
        const records = await Price.find({ symbol: req.params.symbol.toUpperCase() })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();

        if (!records.length)
            return res.status(404).json({ success: false, error: 'No data found' });

        const result = detectAll(records.reverse());
        res.json({ success: true, symbol: req.params.symbol.toUpperCase(), anomaly: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// SENTIMENT
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/sentiment
 */
router.get('/sentiment', async (req, res) => {
    try {
        const result = await fetchSentiment();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// MARKETS — Sensex, Nifty, Gold, Silver
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/markets
 * Latest snapshot of all traditional markets.
 * Serves from DB if data is fresh (< 60s old), otherwise fetches live.
 */
router.get('/markets', async (req, res) => {
    try {
        const ONE_MINUTE_AGO = new Date(Date.now() - 60 * 1000);

        const latest = await MarketData.aggregate([
            { $sort: { timestamp: -1 } },
            { $group: { _id: '$id', doc: { $first: '$$ROOT' } } },
            { $replaceRoot: { newRoot: '$doc' } },
        ]);

        // Fall back to live fetch if DB is empty OR all records are stale (> 60s old)
        const hasFresh = latest.length > 0 && latest.some(d => new Date(d.timestamp) > ONE_MINUTE_AGO);
        if (!hasFresh) {
            const live = await fetchMarkets();
            return res.json({ success: true, data: live });
        }

        res.json({ success: true, data: latest });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/markets/live
 * Force fresh fetch from Yahoo Finance.
 */
router.get('/markets/live', async (req, res) => {
    try {
        const data = await fetchMarkets();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/markets/:id/history?limit=100
 */
router.get('/markets/:id/history', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const records = await MarketData.find({ id: req.params.id.toUpperCase() })
            .sort({ timestamp: -1 })
            .limit(limit)
            .select('price price_usd price_inr change_pct timestamp -_id')
            .lean();
        res.json({ success: true, data: records.reverse() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/markets/:id/predict
 * Returns AI forecast for a market instrument (Sensex, Nifty, Gold, Silver).
 * Uses MarketData model instead of Price model.
 */
router.get('/markets/:id/predict', async (req, res) => {
    try {
        const id = req.params.id.toUpperCase();
        const cacheKey = `market:${id}`;

        // Serve from cache if fresh
        const cached = getCachedPrediction(cacheKey);
        if (cached) return res.json(cached);

        const records = await MarketData.find({ id })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();

        if (records.length < MIN_RECORDS) {
            const secsLeft = Math.ceil((MIN_RECORDS - records.length) * 30); // ~30s per market tick
            return res.status(202).json({
                success: false,
                notReady: true,
                error: `Only ${records.length} of ${MIN_RECORDS} required records found. Try again in ~${secsLeft}s.`,
                count: records.length,
                required: MIN_RECORDS,
            });
        }

        // Grab metadata from newest record BEFORE reversing
        const newestRecord = records[0]; // records are sorted -1 so index 0 is newest

        // Map MarketData records to the same shape generateReport expects
        const mapped = records.reverse().map((r) => ({
            price_usd: r.price_usd || r.price,
            price_inr: r.price_inr || r.price,
            volume_24h: r.volume || 0,
            timestamp: r.timestamp,
        }));

        const report = generateReport(mapped);

        const response = {
            success: true,
            id,
            name: newestRecord.name,
            currency: newestRecord.currency,
            price_usd: newestRecord.price_usd,
            price_inr: newestRecord.price_inr,
            usd_inr_rate: newestRecord.usd_inr_rate,
            prediction: report,
        };
        setCachedPrediction(cacheKey, response);
        res.json(response);
    } catch (err) {
        console.error('Market predict error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/markets/:id/anomaly
 * Returns anomaly detection for a market instrument.
 */
router.get('/markets/:id/anomaly', async (req, res) => {
    try {
        const id = req.params.id.toUpperCase();

        const records = await MarketData.find({ id })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();

        if (!records.length) {
            return res.status(404).json({ success: false, error: 'No data found' });
        }

        // Map to price_usd shape
        const mapped = records.reverse().map((r) => ({
            price_usd: r.price_usd || r.price,
            volume_24h: r.volume || 0,
        }));

        const result = detectAll(mapped);
        res.json({ success: true, id, anomaly: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;