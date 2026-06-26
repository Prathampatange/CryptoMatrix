const axios = require('axios');

let cache = {
    rate: 83.5,
    fetchedAt: 0,
};

const CACHE_TTL = 60000;

const getUSDToINR = async () => {
    const now = Date.now();

    if (now - cache.fetchedAt < CACHE_TTL) {
        return cache.rate;
    }

    try {
        const { data } = await axios.get(
            'https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X',
            { timeout: 3000 }
        );

        const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;

        if (rate) {
            cache = { rate, fetchedAt: now };
            return rate;
        }
    } catch { }

    return cache.rate;
};

const toINR = (usd, rate) => +(usd * rate).toFixed(2);
const getCachedRate = () => cache.rate;
const getCacheSource = () => 'Yahoo Finance';
const getCacheUpdated = () => new Date(cache.fetchedAt);

module.exports = { getUSDToINR, toINR, getCachedRate, getCacheSource, getCacheUpdated };