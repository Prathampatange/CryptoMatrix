const router = require('express').Router();
const Portfolio = require('../models/Portfolio');
const Price = require('../models/Price');
const MarketData = require('../models/MarketData');
const { getCachedRate } = require('../services/currencyService');

// ─────────────────────────────────────────────────────────────
// Fetch latest prices for BOTH crypto (Price) and
// market assets like GOLD/SILVER/SENSEX/NIFTY (MarketData)
// ─────────────────────────────────────────────────────────────
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'];

const getLatestPrices = async (symbols) => {
    const cryptoSymbols = symbols.filter(s => CRYPTO_SYMBOLS.includes(s));
    const marketSymbols = symbols.filter(s => !CRYPTO_SYMBOLS.includes(s));

    const [cryptoPrices, marketPrices] = await Promise.all([
        cryptoSymbols.length
            ? Price.aggregate([
                { $match: { symbol: { $in: cryptoSymbols } } },
                { $sort: { timestamp: -1 } },
                { $group: { _id: '$symbol', price_usd: { $first: '$price_usd' }, price_inr: { $first: '$price_inr' } } },
            ])
            : [],
        marketSymbols.length
            ? MarketData.aggregate([
                { $match: { id: { $in: marketSymbols } } },
                { $sort: { timestamp: -1 } },
                { $group: { _id: '$id', price_usd: { $first: '$price_usd' }, price_inr: { $first: '$price_inr' } } },
            ])
            : [],
    ]);

    return Object.fromEntries(
        [...cryptoPrices, ...marketPrices].map(r => [r._id, { price_usd: r.price_usd, price_inr: r.price_inr }])
    );
};

// ─────────────────────────────────────────────────────────────
// Unit metadata for every supported asset
// ─────────────────────────────────────────────────────────────
const UNIT_META = {
    BTC: { unit: 1, unitLabel: '1 coin', unitNote: 'Per Bitcoin' },
    ETH: { unit: 1, unitLabel: '1 coin', unitNote: 'Per Ethereum' },
    SOL: { unit: 1, unitLabel: '1 coin', unitNote: 'Per Solana' },
    BNB: { unit: 1, unitLabel: '1 coin', unitNote: 'Per Binance Coin' },
    GOLD: { unit: 10, unitLabel: '10 grams', unitNote: 'MCX India standard unit' },
    SILVER: { unit: 1000, unitLabel: '1 kg (1000g)', unitNote: 'MCX India standard unit' },
    SENSEX: { unit: 1, unitLabel: '1 index point', unitNote: 'Tracks 30 BSE large-cap companies' },
    NIFTY: { unit: 75, unitLabel: '1 lot (75 units)', unitNote: 'NSE F&O standard lot size = 75 units' },
};

// ─────────────────────────────────────────────────────────────
// GET /api/portfolio
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        let portfolio = await Portfolio.findOne({ user_id: 'default' });
        if (!portfolio)
            portfolio = await Portfolio.create({ user_id: 'default', holdings: [] });

        const symbols = portfolio.holdings.map(h => h.symbol);
        const prices = symbols.length ? await getLatestPrices(symbols) : {};
        const rate = getCachedRate();

        const holdings = portfolio.holdings.map(h => {
            const p = prices[h.symbol] || {};
            const priceUsd = p.price_usd || 0;
            const priceInr = p.price_inr || priceUsd * rate;
            const meta = UNIT_META[h.symbol] || { unit: 1, unitLabel: '1 unit', unitNote: '' };

            const valueUsd = priceUsd * h.quantity;
            const valueInr = priceInr * h.quantity;
            const costUsd = h.avg_buy_price * h.quantity;
            const costInr = costUsd * rate;
            const pnlUsd = valueUsd - costUsd;
            const pnlInr = valueInr - costInr;
            const pnlPct = costUsd > 0 ? (pnlUsd / costUsd) * 100 : 0;

            return {
                _id: h._id,
                symbol: h.symbol,
                name: h.name,
                quantity: h.quantity,
                unit_label: meta.unitLabel,
                unit_note: meta.unitNote,
                avg_buy_price_usd: +h.avg_buy_price.toFixed(2),
                avg_buy_price_inr: +(h.avg_buy_price * rate).toFixed(2),
                current_price_usd: +priceUsd.toFixed(2),
                current_price_inr: +priceInr.toFixed(2),
                current_value_usd: +valueUsd.toFixed(2),
                current_value_inr: +valueInr.toFixed(2),
                cost_basis_usd: +costUsd.toFixed(2),
                cost_basis_inr: +costInr.toFixed(2),
                pnl_usd: +pnlUsd.toFixed(2),
                pnl_inr: +pnlInr.toFixed(2),
                pnl_pct: +pnlPct.toFixed(2),
                usd_inr_rate: rate,
                added_at: h.added_at,
            };
        });

        const totalValueUsd = holdings.reduce((s, h) => s + h.current_value_usd, 0);
        const totalValueInr = holdings.reduce((s, h) => s + h.current_value_inr, 0);
        const totalCostUsd = holdings.reduce((s, h) => s + h.cost_basis_usd, 0);
        const totalCostInr = holdings.reduce((s, h) => s + h.cost_basis_inr, 0);
        const totalPnlUsd = totalValueUsd - totalCostUsd;
        const totalPnlInr = totalValueInr - totalCostInr;
        const totalPnlPct = totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : 0;

        res.json({
            success: true,
            data: {
                holdings,
                summary: {
                    total_value_usd: +totalValueUsd.toFixed(2),
                    total_value_inr: +totalValueInr.toFixed(2),
                    total_cost_usd: +totalCostUsd.toFixed(2),
                    total_cost_inr: +totalCostInr.toFixed(2),
                    total_pnl_usd: +totalPnlUsd.toFixed(2),
                    total_pnl_inr: +totalPnlInr.toFixed(2),
                    total_pnl_pct: +totalPnlPct.toFixed(2),
                    usd_inr_rate: rate,
                },
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/portfolio/holdings
// ─────────────────────────────────────────────────────────────
router.post('/holdings', async (req, res) => {
    try {
        const { symbol, name, quantity, avg_buy_price } = req.body;
        if (!symbol || !quantity || !avg_buy_price)
            return res.status(400).json({ success: false, error: 'Missing required fields' });

        let portfolio = await Portfolio.findOne({ user_id: 'default' });
        if (!portfolio) portfolio = new Portfolio({ user_id: 'default', holdings: [] });

        const existing = portfolio.holdings.find(h => h.symbol === symbol.toUpperCase());
        if (existing) {
            const totalQty = existing.quantity + parseFloat(quantity);
            const weightedAvg = (existing.avg_buy_price * existing.quantity + avg_buy_price * quantity) / totalQty;
            existing.quantity = totalQty;
            existing.avg_buy_price = +weightedAvg.toFixed(6);
        } else {
            portfolio.holdings.push({
                symbol: symbol.toUpperCase(),
                name: name || symbol.toUpperCase(),
                quantity: parseFloat(quantity),
                avg_buy_price: parseFloat(avg_buy_price),
            });
        }

        await portfolio.save();
        res.json({ success: true, message: 'Holding saved' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/portfolio/holdings/:id
// ─────────────────────────────────────────────────────────────
router.delete('/holdings/:id', async (req, res) => {
    try {
        const portfolio = await Portfolio.findOne({ user_id: 'default' });
        if (!portfolio)
            return res.status(404).json({ success: false, error: 'Portfolio not found' });

        portfolio.holdings = portfolio.holdings.filter(
            h => h._id.toString() !== req.params.id
        );
        await portfolio.save();
        res.json({ success: true, message: 'Holding removed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;