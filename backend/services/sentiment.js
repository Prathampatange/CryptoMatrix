const Parser = require('rss-parser');
const parser = new Parser();

const POSITIVE = { bullish: 2, surge: 2, rally: 2, soar: 2, breakout: 2, adoption: 1.5, partnership: 1.5, upgrade: 1.5, launch: 1, growth: 1, gain: 1, rise: 1, pump: 1.5, moon: 2, record: 1.5, etf: 1.5, approval: 1.5, buy: 0.5 };
const NEGATIVE = { bearish: 2, crash: 2, plunge: 2, dump: 2, ban: 2, hack: 2, exploit: 2, fraud: 2, scam: 2, collapse: 2, liquidation: 1.5, sell: 0.5, loss: 1, decline: 1, drop: 1, fear: 1.5, warning: 1, lawsuit: 1.5, delist: 2 };

const scoreText = (text) => {
    if (!text) return 0;
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
    let pos = 0, neg = 0;
    words.forEach(w => { if (POSITIVE[w]) pos += POSITIVE[w]; if (NEGATIVE[w]) neg += NEGATIVE[w]; });
    const total = pos + neg;
    return total === 0 ? 0 : +((pos - neg) / total).toFixed(4);
};

const classify = (s) => s > 0.3 ? 'VERY_POSITIVE' : s > 0.1 ? 'POSITIVE' : s < -0.3 ? 'VERY_NEGATIVE' : s < -0.1 ? 'NEGATIVE' : 'NEUTRAL';

let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000;

const fetchSentiment = async (symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'SENSEX', 'NIFTY', 'GOLD', 'SILVER']) => {
    const now = Date.now();
    if (cache.data && now - cache.fetchedAt < CACHE_TTL) return cache.data;

    try {
        const [cryptoFeed, marketFeed] = await Promise.allSettled([
            parser.parseURL('https://cointelegraph.com/rss'),
            parser.parseURL('https://news.google.com/rss/search?q=Sensex+OR+Nifty+OR+Gold+price+OR+Silver+price&hl=en-IN&gl=IN&ceid=IN:en')
        ]);

        const articles = [];
        if (cryptoFeed.status === 'fulfilled') {
            articles.push(...(cryptoFeed.value.items || []).slice(0, 30));
        }
        if (marketFeed.status === 'fulfilled') {
            articles.push(...(marketFeed.value.items || []).slice(0, 30));
        }

        const scored = articles.map(a => ({
            title: a.title,
            url: a.link,
            score: scoreText(a.title + ' ' + (a.contentSnippet || a.content || '')),
        }));

        const sentimentMap = {};
        const nameMap = { 
            BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binance',
            SENSEX: 'sensex', NIFTY: 'nifty', GOLD: 'gold', SILVER: 'silver'
        };

        symbols.forEach(sym => {
            const related = scored.filter(a => {
                const t = a.title.toLowerCase();
                return t.includes(sym.toLowerCase()) || t.includes(nameMap[sym] || sym);
            });
            const avg = related.length ? related.reduce((s, a) => s + a.score, 0) / related.length : 0;
            sentimentMap[sym] = {
                score: +avg.toFixed(4),
                label: classify(avg),
                articleCount: related.length,
                topHeadlines: related.slice(0, 3),
            };
        });

        const result = { sentimentMap, updatedAt: new Date() };
        cache = { data: result, fetchedAt: now };
        return result;
    } catch (err) {
        console.error('Sentiment fetch error:', err.message);
        return cache.data || { sentimentMap: {}, updatedAt: new Date() };
    }
};

module.exports = { fetchSentiment };