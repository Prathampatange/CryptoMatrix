const fetch = require('node-fetch');
const { getUSDToINR, toINR } = require('./currencyService');
const MarketData = require('../models/MarketData');

const CACHE_DURATION = 30000;
const FETCH_TIMEOUT = 5000;

// Troy ounce to gram conversion
const TROY_OZ_TO_GRAMS = 31.1035;

const MARKETS = [
    {
        symbol: '^BSESN',
        id: 'SENSEX',
        name: 'BSE Sensex',
        category: 'index',
        currency: 'INR',
        flag: '🇮🇳',
        unit: 1,
        unitLabel: '1 index point',
        unitShort: 'per point',
        unitNote: 'Tracks 30 BSE large-cap companies',
    },
    {
        symbol: '^NSEI',
        id: 'NIFTY',
        name: 'Nifty 50',
        category: 'index',
        currency: 'INR',
        flag: '🇮🇳',
        unit: 75,
        unitLabel: '1 lot (75 units)',
        unitShort: 'per lot',
        unitNote: 'NSE F&O standard lot size = 75 units',
    },
    {
        symbol: 'GC=F',
        id: 'GOLD',
        name: 'Gold',
        category: 'commodity',
        currency: 'USD',
        flag: '🥇',
        unit: 10,
        unitLabel: '10 grams',
        unitShort: 'per 10g',
        unitNote: 'MCX India standard unit. Yahoo gives price per troy oz (31.1035g)',
        gramsPerOz: TROY_OZ_TO_GRAMS,
    },
    {
        symbol: 'SI=F',
        id: 'SILVER',
        name: 'Silver',
        category: 'commodity',
        currency: 'USD',
        flag: '🥈',
        unit: 1000,
        unitLabel: '1 kg (1000g)',
        unitShort: 'per kg',
        unitNote: 'MCX India standard unit. Yahoo gives price per troy oz (31.1035g)',
        gramsPerOz: TROY_OZ_TO_GRAMS,
    },
];

let marketCache = { data: null, lastFetch: 0 };
let currencyCache = { rate: null, lastFetch: 0 };
const lastPrices = {};

const fetchWithTimeout = async (url) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
        const res = await fetch(url, { signal: controller.signal });
        return await res.json();
    } catch (err) {
        console.warn('Market fetch timeout/error:', err.message);
        return null;
    } finally {
        clearTimeout(t);
    }
};

const getCachedUSDINR = async () => {
    const now = Date.now();
    if (currencyCache.rate && now - currencyCache.lastFetch < 60000) return currencyCache.rate;
    const rate = await getUSDToINR();
    currencyCache = { rate, lastFetch: now };
    return rate;
};

const fetchOne = async (market, usdInrRate) => {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(market.symbol)}?interval=1d&range=1d`;
        const data = await fetchWithTimeout(url);
        if (!data?.chart?.result?.length) return null;

        const quote = data.chart.result[0];
        const meta = quote.meta;
        if (!meta?.regularMarketPrice) return null;

        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose || meta.previousClose || price;
        const change = price - prevClose;
        const changePct = prevClose ? (change / prevClose) * 100 : 0;

        let dayHigh = price, dayLow = price, volume = 0;
        if (quote.indicators?.quote?.[0]) {
            const q = quote.indicators.quote[0];
            const highs = (q.high || []).filter(v => v != null);
            const lows = (q.low || []).filter(v => v != null);
            const vols = (q.volume || []).filter(v => v != null);
            if (highs.length) dayHigh = Math.max(...highs);
            if (lows.length) dayLow = Math.min(...lows);
            if (vols.length) volume = vols[vols.length - 1];
        }

        const prev = lastPrices[market.id];
        const tickChg = prev ? ((price - prev) / prev) * 100 : 0;
        lastPrices[market.id] = price;

        // ── Raw USD / INR prices ──────────────────────────────
        const priceUsd = market.currency === 'INR' ? price / usdInrRate : price;
        const priceInr = market.currency === 'INR' ? price : toINR(price, usdInrRate);

        // ── Unit price calculation ────────────────────────────
        let unitPriceUsd, unitPriceInr;

        if (market.id === 'GOLD' || market.id === 'SILVER') {
            // Yahoo gives price per troy oz → convert to price per gram → × unit
            const pricePerGramUsd = price / market.gramsPerOz;           // USD per gram
            const pricePerGramInr = pricePerGramUsd * usdInrRate;         // INR per gram
            unitPriceUsd = +(pricePerGramUsd * market.unit).toFixed(2);   // USD for 10g or 1000g
            unitPriceInr = +(pricePerGramInr * market.unit).toFixed(2);   // INR for 10g or 1000g
        } else if (market.id === 'NIFTY') {
            // 1 lot = 75 units × index value
            unitPriceUsd = +(priceUsd * market.unit).toFixed(2);
            unitPriceInr = +(price * market.unit).toFixed(2);          // price is already INR
        } else {
            // SENSEX — show per index point (same as raw price)
            unitPriceUsd = +priceUsd.toFixed(2);
            unitPriceInr = +priceInr.toFixed(2);
        }

        // ── Day range unit prices ─────────────────────────────
        let unitHighUsd, unitHighInr, unitLowUsd, unitLowInr;
        if (market.id === 'GOLD' || market.id === 'SILVER') {
            unitHighUsd = +((dayHigh / market.gramsPerOz) * market.unit).toFixed(2);
            unitHighInr = +(unitHighUsd * usdInrRate).toFixed(2);
            unitLowUsd = +((dayLow / market.gramsPerOz) * market.unit).toFixed(2);
            unitLowInr = +(unitLowUsd * usdInrRate).toFixed(2);
        } else if (market.id === 'NIFTY') {
            const highUsd = market.currency === 'INR' ? dayHigh / usdInrRate : dayHigh;
            const lowUsd = market.currency === 'INR' ? dayLow / usdInrRate : dayLow;
            unitHighUsd = +(highUsd * market.unit).toFixed(2);
            unitHighInr = +(dayHigh * market.unit).toFixed(2);
            unitLowUsd = +(lowUsd * market.unit).toFixed(2);
            unitLowInr = +(dayLow * market.unit).toFixed(2);
        } else {
            unitHighUsd = market.currency === 'INR' ? +(dayHigh / usdInrRate).toFixed(2) : +dayHigh.toFixed(2);
            unitHighInr = market.currency === 'INR' ? +dayHigh.toFixed(2) : toINR(dayHigh, usdInrRate);
            unitLowUsd = market.currency === 'INR' ? +(dayLow / usdInrRate).toFixed(2) : +dayLow.toFixed(2);
            unitLowInr = market.currency === 'INR' ? +dayLow.toFixed(2) : toINR(dayLow, usdInrRate);
        }

        return {
            id: market.id,
            symbol: market.symbol,
            name: market.name,
            category: market.category,
            currency: market.currency,
            flag: market.flag,

            // Raw price (per oz for metals, per index point for indices)
            price: +price.toFixed(2),
            price_usd: +priceUsd.toFixed(2),
            price_inr: +priceInr.toFixed(2),
            usd_inr_rate: usdInrRate,

            // Standard trading unit
            unit: market.unit,
            unit_label: market.unitLabel,
            unit_short: market.unitShort,
            unit_note: market.unitNote,
            unit_price_usd: unitPriceUsd,
            unit_price_inr: unitPriceInr,

            // Day range (raw)
            day_high: +dayHigh.toFixed(2),
            day_high_usd: market.currency === 'INR' ? +(dayHigh / usdInrRate).toFixed(2) : +dayHigh.toFixed(2),
            day_high_inr: market.currency === 'INR' ? +dayHigh.toFixed(2) : toINR(dayHigh, usdInrRate),

            day_low: +dayLow.toFixed(2),
            day_low_usd: market.currency === 'INR' ? +(dayLow / usdInrRate).toFixed(2) : +dayLow.toFixed(2),
            day_low_inr: market.currency === 'INR' ? +dayLow.toFixed(2) : toINR(dayLow, usdInrRate),

            // Day range (unit-based)
            unit_high_usd: unitHighUsd,
            unit_high_inr: unitHighInr,
            unit_low_usd: unitLowUsd,
            unit_low_inr: unitLowInr,

            prev_close: +prevClose.toFixed(2),
            prev_close_inr: market.currency === 'INR' ? +prevClose.toFixed(2) : toINR(prevClose, usdInrRate),

            change: +change.toFixed(2),
            change_pct: +changePct.toFixed(4),
            volume: volume || 0,
            market_state: meta.marketState || 'CLOSED',
            tick_change_pct: +tickChg.toFixed(4),
            timestamp: new Date(),
        };
    } catch (err) {
        console.error(`Market fetch error [${market.id}]:`, err.message);
        return null;
    }
};

const fetchMarkets = async () => {
    const now = Date.now();
    if (marketCache.data && now - marketCache.lastFetch < CACHE_DURATION) {
        return marketCache.data;
    }

    const usdInrRate = await getCachedUSDINR();
    const results = await Promise.all(MARKETS.map(m => fetchOne(m, usdInrRate)));
    const valid = results.filter(Boolean);

    marketCache = { data: valid, lastFetch: now };

    if (valid.length) {
        setTimeout(async () => {
            try {
                const docs = valid.map(({ tick_change_pct, ...doc }) => doc);
                await MarketData.insertMany(docs);
            } catch (err) {
                console.warn('MarketData persist warn:', err.message);
            }
        }, 0);
    }

    return valid;
};

module.exports = { fetchMarkets, MARKETS };