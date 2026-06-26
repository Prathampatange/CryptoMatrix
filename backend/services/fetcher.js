const axios = require('axios');
const Price = require('../models/Price');
const { getUSDToINR, toINR } = require('./currencyService');

const COINS = {
    bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', binancecoin: 'BNB',
};

let cache = { data: null, lastFetch: 0 };
const CACHE_DURATION = 30000;
const lastPrices = {};

const fetchPrices = async () => {
    const now = Date.now();

    if (cache.data && now - cache.lastFetch < CACHE_DURATION) {
        return cache.data;
    }

    try {
        const [usdInrRate, response] = await Promise.all([
            getUSDToINR(),
            axios.get(`${process.env.COINGECKO_BASE_URL}/coins/markets`, {
                params: { vs_currency: 'usd', ids: 'bitcoin,ethereum,solana,binancecoin' },
                timeout: 5000,
            })
        ]);

        const ticks = response.data.map(c => {
            const symbol = COINS[c.id] || c.symbol.toUpperCase();
            const prev = lastPrices[symbol];
            const tickChg = prev ? ((c.current_price - prev) / prev) * 100 : 0;
            lastPrices[symbol] = c.current_price;

            return {
                symbol,
                name: c.name,
                price_usd: c.current_price,
                price_inr: toINR(c.current_price, usdInrRate),
                usd_inr_rate: usdInrRate,
                market_cap: c.market_cap || 0,
                volume_24h: c.total_volume || 0,
                price_change_24h: c.price_change_24h || 0,
                price_change_pct_24h: c.price_change_percentage_24h || 0,
                tick_change_pct: +tickChg.toFixed(4),
                timestamp: new Date(),
            };
        });

        cache = { data: ticks, lastFetch: now };

        // Non-blocking DB write
        setImmediate(() => {
            const docs = ticks.map(({ tick_change_pct, ...doc }) => doc);
            Price.insertMany(docs).catch(() => {});
        });

        return ticks;
    } catch (err) {
        console.error('Fetch error:', err.message);
        return cache.data || [];
    }
};

module.exports = { fetchPrices };