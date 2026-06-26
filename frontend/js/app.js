/**
 * frontend/js/app.js
 * Main application — CryptoMatrix with global currency toggle.
 */

const socket = io(window.location.origin, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
});

// ── DOM refs ───────────────────────────────────────────────
const connectionBadge = document.getElementById('connection-badge');
const statusDot = document.getElementById('status-dot');
const lastUpdateEl = document.getElementById('last-update');
const cardGrid = document.getElementById('cards-grid');
const alertContainer = document.getElementById('alert-container');
const coinSelect = document.getElementById('coin-select');
const chartTitle = document.getElementById('chart-title');

let selectedCoin = 'BTC';
let latestTicks = {};
let latestAnalytics = {};
let latestAnomalies = {};
let latestMarketData = {};

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'];
const MARKET_SYMBOLS = ['SENSEX', 'NIFTY', 'GOLD', 'SILVER'];
// Defines the desired display order in the cards grid
const MARKET_CARD_ORDER = ['BTC', 'ETH', 'SOL', 'BNB', 'SENSEX', 'NIFTY', 'GOLD', 'SILVER'];

const tickerMap = {
    BTC: ['t-btc', 't-btc2'], ETH: ['t-eth', 't-eth2'],
    SOL: ['t-sol', 't-sol2'], BNB: ['t-bnb', 't-bnb2'],
};

// ── Connection ─────────────────────────────────────────────
socket.on('connect', () => {
    connectionBadge.className = 'live';
    connectionBadge.textContent = 'LIVE';
    statusDot.className = 'status-dot online';
});

socket.on('disconnect', () => {
    connectionBadge.className = '';
    connectionBadge.textContent = 'OFFLINE';
    statusDot.className = 'status-dot offline';
});

// ── Coin selector ──────────────────────────────────────────
coinSelect?.addEventListener('change', (e) => {
    selectedCoin = e.target.value;
    chartTitle.textContent = `${selectedCoin} — Price & Moving Averages`;
    CryptoCharts.renderChart(selectedCoin);
    updateStats(selectedCoin, MARKET_SYMBOLS.includes(selectedCoin) ? null : latestAnalytics[selectedCoin]);
});

// ── Re-render on currency change ───────────────────────────
document.addEventListener('currency-changed', () => {
    Object.values(latestTicks).forEach(tick => {
        if (CRYPTO_SYMBOLS.includes(tick.symbol))
            renderCryptoCard(tick, latestAnalytics[tick.symbol] || {}, latestAnomalies[tick.symbol] || {});
    });
    Object.values(latestMarketData).forEach(m => renderMarketCardInDashboard(m));
    updateStats(selectedCoin, MARKET_SYMBOLS.includes(selectedCoin) ? null : latestAnalytics[selectedCoin]);
    document.dispatchEvent(new CustomEvent('rerender-markets'));
    document.dispatchEvent(new CustomEvent('rerender-portfolio'));
});

document.addEventListener('rate-updated', () => {
    Object.values(latestTicks).forEach(tick => {
        if (CRYPTO_SYMBOLS.includes(tick.symbol))
            renderCryptoCard(tick, latestAnalytics[tick.symbol] || {}, latestAnomalies[tick.symbol] || {});
    });
    Object.values(latestMarketData).forEach(m => renderMarketCardInDashboard(m));
    updateStats(selectedCoin, MARKET_SYMBOLS.includes(selectedCoin) ? null : latestAnalytics[selectedCoin]);
});

// ── Price update (socket) ──────────────────────────────────
socket.on('price_update', ({ ticks, analyticsMap, anomalyMap = {}, timestamp }) => {
    lastUpdateEl.textContent = new Date(timestamp).toLocaleTimeString();

    // Sync exchange rate from tick if available
    const firstTick = ticks.find(t => t.usd_inr_rate);
    if (firstTick?.usd_inr_rate) {
        window.CurrencyState.usdInrRate = firstTick.usd_inr_rate;
        const rateEl = document.getElementById('exchange-rate-display');
        if (rateEl) rateEl.textContent = `1 USD = ₹${firstTick.usd_inr_rate.toFixed(2)}`;
    }

    ticks.forEach(tick => {
        const analytics = analyticsMap[tick.symbol] || {};
        const anomaly = anomalyMap[tick.symbol] || {};

        latestTicks[tick.symbol] = tick;
        latestAnalytics[tick.symbol] = analytics;
        latestAnomalies[tick.symbol] = anomaly;

        if (CRYPTO_SYMBOLS.includes(tick.symbol)) {
            renderCryptoCard(tick, analytics, anomaly);
            CryptoCharts.pushTick(tick.symbol, tick, analytics);

            // Ticker tape
            const ids = tickerMap[tick.symbol];
            if (ids) {
                const rate = window.CurrencyState?.usdInrRate || 83.5;
                const inrVal = tick.price_inr || tick.price_usd * rate;
                const val = `$${tick.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ₹${inrVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = val; });
            }

        } else if (MARKET_SYMBOLS.includes(tick.symbol)) {
            // Push market ticks into chart buffer so the graph plots them
            CryptoCharts.pushTick(tick.symbol, tick, {});
        }
    });

    window._latestTicks = latestTicks;
    window._latestAnalytics = latestAnalytics;
    window._latestAnomalies = latestAnomalies;

    CryptoCharts.renderChart(selectedCoin);
    updateStats(selectedCoin, analyticsMap[selectedCoin]);

    if (window.Portfolio && document.getElementById('tab-portfolio')?.classList.contains('active')) {
        window.Portfolio.reload();
    }
});

socket.on('alerts', (alerts) => alerts.forEach(showAlert));

socket.on('market_update', ({ markets }) => {
    if (window.Markets) window.Markets.renderMarketCards(markets);

    if (markets?.length) {
        markets.forEach(m => {
            latestMarketData[m.id] = m;
            renderMarketCardInDashboard(m);

            // Push into chart buffer
            CryptoCharts.pushTick(m.id, {
                price_usd: m.price_usd || 0,
                price_inr: m.price_inr || 0,
                volume_24h: m.volume || 0,
                timestamp: m.timestamp || new Date(),
            }, {});
        });

        // Re-render chart and stats if user is viewing a market symbol
        if (MARKET_SYMBOLS.includes(selectedCoin)) {
            CryptoCharts.renderChart(selectedCoin);
            updateStats(selectedCoin, null);
        }
    }
});

socket.on('sentiment_update', ({ sentimentMap }) => {
    if (window.SentimentUI) window.SentimentUI.renderSentiment(sentimentMap);
    const el = document.getElementById('sentiment-updated');
    if (el) el.textContent = 'Last updated ' + new Date().toLocaleTimeString();
});

// ── Crypto card rendering ──────────────────────────────────
const cryptoCardMap = {};

const renderCryptoCard = (tick, analytics, anomaly) => {
    const up = tick.price_change_pct_24h >= 0;
    const arrow = up ? '▲' : '▼';
    const cls = up ? 'change--up' : 'change--down';

    const priceHTML = window.formatDualHTML ? window.formatDualHTML(tick)
        : `<div class="card-price-usd">$${tick.price_usd.toLocaleString()}</div>`;
    const volBillUsd = (tick.volume_24h / 1e9).toFixed(2);
    const anomalyBadge = anomaly.isAnomaly
        ? `<span style="font-size:10px;color:var(--amber);font-family:var(--font-mono)">⚠ ANOMALY</span>`
        : '';

    if (!cryptoCardMap[tick.symbol]) {
        const card = document.createElement('div');
        card.className = 'price-card';
        card.id = `card-${tick.symbol}`;
        cardGrid.appendChild(card);
        cryptoCardMap[tick.symbol] = card;
        sortDashboardCards(); // re-sort every time a new card is added
    }

    const card = cryptoCardMap[tick.symbol];
    card.innerHTML = `
    <div class="card-header">
      <div class="coin-info">
        <div class="coin-name">${tick.name}</div>
        <div class="coin-symbol">${tick.symbol}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="coin-rank">#LIVE</span>
        ${anomalyBadge}
      </div>
    </div>
    <div class="card-price-wrap">${priceHTML}</div>
    <div class="card-change ${cls}">
      ${arrow} ${Math.abs(tick.price_change_pct_24h).toFixed(2)}%
      <span style="color:var(--text3);font-weight:400">24h</span>
    </div>
    <div class="card-meta">
      <span>VOL $${volBillUsd}B</span>
      <span>VOLAT ${(analytics.volatility ?? 0).toFixed(2)}%</span>
    </div>
  `;

    card.classList.remove('card-flash-up', 'card-flash-down');
    void card.offsetWidth;
    card.classList.add(up ? 'card-flash-up' : 'card-flash-down');
};

// ── Market card rendering (dashboard) ─────────────────────
const marketCardMap = {};

const renderMarketCardInDashboard = (m) => {
    const up = (m.change_pct || 0) >= 0;
    const arrow = up ? '▲' : '▼';
    const cls = up ? 'change--up' : 'change--down';
    const isOpen = ['REGULAR', 'PRE', 'POST'].includes(m.market_state);
    const mode = window.CurrencyState?.mode || 'BOTH';

    const unitUsd = m.unit_price_usd || m.price_usd;
    const unitInr = m.unit_price_inr || m.price_inr;
    const usdStr = window.formatUSD ? window.formatUSD(unitUsd) : `$${unitUsd}`;
    const inrStr = window.formatINR ? window.formatINR(unitInr) : `₹${unitInr}`;
    const primary = m.currency === 'INR' ? inrStr : usdStr;
    const secondary = m.currency === 'INR' ? usdStr : inrStr;

    let priceHTML = '';
    if (mode === 'USD') priceHTML = `<div class="card-price-usd">${usdStr}</div>`;
    else if (mode === 'INR') priceHTML = `<div class="card-price-usd">${inrStr}</div>`;
    else priceHTML = `<div class="card-price-usd" style="font-size:20px">${primary}</div><div class="card-price-inr">${secondary}</div>`;

    const statusColor = isOpen ? 'color:var(--green);border-color:rgba(16,212,136,0.3)' : 'color:var(--text3)';
    const statusText = isOpen ? '● OPEN' : '○ CLOSED';

    const highStr = m.currency === 'INR'
        ? (window.formatINR ? window.formatINR(m.unit_high_inr || m.day_high_inr) : `₹${m.day_high_inr}`)
        : (window.formatUSD ? window.formatUSD(m.unit_high_usd || m.day_high_usd) : `$${m.day_high_usd}`);
    const lowStr = m.currency === 'INR'
        ? (window.formatINR ? window.formatINR(m.unit_low_inr || m.day_low_inr) : `₹${m.day_low_inr}`)
        : (window.formatUSD ? window.formatUSD(m.unit_low_usd || m.day_low_usd) : `$${m.day_low_usd}`);

    if (!marketCardMap[m.id]) {
        const card = document.createElement('div');
        card.className = 'price-card';
        card.id = `dash-mcard-${m.id}`;
        cardGrid.appendChild(card);
        marketCardMap[m.id] = card;
        sortDashboardCards(); // re-sort every time a new card is added
    }

    const card = marketCardMap[m.id];
    card.innerHTML = `
    <div class="card-header">
      <div class="coin-info">
        <div class="coin-name">${m.flag || ''} ${m.name}</div>
        <div class="coin-symbol">${m.id}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="coin-rank" style="${statusColor}">${statusText}</span>
        <span style="font-size:10px;color:var(--cyan);font-family:var(--font-mono);background:var(--cyan-dim);padding:2px 6px;border-radius:4px;border:1px solid rgba(0,245,196,0.2)">${m.unit_label || m.category || ''}</span>
      </div>
    </div>
    <div class="card-price-wrap">${priceHTML}</div>
    <div class="card-change ${cls}">
      ${arrow} ${Math.abs(m.change_pct || 0).toFixed(2)}%
      <span style="color:var(--text3);font-weight:400">today</span>
    </div>
    <div class="card-meta">
      <span>H: ${highStr}</span>
      <span>L: ${lowStr}</span>
    </div>
  `;

    card.classList.remove('card-flash-up', 'card-flash-down');
    void card.offsetWidth;
    card.classList.add(up ? 'card-flash-up' : 'card-flash-down');
};

// ── Sort cards into correct order ──────────────────────────
// Called every time a card is created so the order is always right
// regardless of whether crypto or market cards arrive first.
const sortDashboardCards = () => {
    MARKET_CARD_ORDER.forEach(id => {
        const el = document.getElementById(`card-${id}`) || document.getElementById(`dash-mcard-${id}`);
        if (el && el.parentNode === cardGrid) cardGrid.appendChild(el);
    });
};

// ── Pre-load market data on startup ───────────────────────
// Runs on DOMContentLoaded — fetches markets via REST so the
// dashboard doesn't wait 30s for the first socket market_update.
const preloadMarkets = async () => {
    try {
        const res = await fetch('/api/markets');
        const data = await res.json();
        if (data.success && data.data.length) {
            data.data.forEach(m => {
                latestMarketData[m.id] = m;
                renderMarketCardInDashboard(m);

                // Prime chart buffer with first data point
                CryptoCharts.pushTick(m.id, {
                    price_usd: m.price_usd || 0,
                    price_inr: m.price_inr || 0,
                    volume_24h: m.volume || 0,
                    timestamp: m.timestamp || new Date(),
                }, {});
            });
            window._latestMarketData = latestMarketData;
            if (window.Markets) window.Markets.renderMarketCards(data.data);
        }
    } catch (err) {
        console.warn('Preload markets failed:', err.message);
    }
};

document.addEventListener('DOMContentLoaded', () => preloadMarkets());

// ── Stats panel ────────────────────────────────────────────
const fmtPct = (v) => v != null ? v.toFixed(2) + '%' : '—';

const updateStats = (symbol, analytics) => {
    const isMarket = MARKET_SYMBOLS.includes(symbol);
    const market = latestMarketData[symbol];

    if (isMarket && market) {
        const fUSD = window.formatUSD || (v => v != null ? '$' + parseFloat(v).toFixed(2) : '—');
        const fINR = window.formatINR || (v => v != null ? '₹' + parseFloat(v).toFixed(2) : '—');
        const rate = window.CurrencyState?.usdInrRate || 83.5;
        const mode = window.CurrencyState?.mode || 'BOTH';
        const isINR = ['SENSEX', 'NIFTY'].includes(symbol);
        const changePct = market.change_pct || 0;

        // Helper: format a high/low pair using the correct unit_ or day_ field names
        const fHL = (uKey, iKey) => {
            const u = market[uKey];
            const i = market[iKey];
            if (!u && !i) return '—';
            if (mode === 'USD') return fUSD(u);
            if (mode === 'INR') return fINR(i);
            return isINR ? `${fINR(i)} / ${fUSD(u)}` : `${fUSD(u)} / ${fINR(i)}`;
        };

        // Prev close: backend field is prev_close (native currency) + prev_close_inr
        const fPrev = () => {
            if (!market.prev_close && !market.prev_close_inr) return '—';
            const pInr = market.prev_close_inr || (isINR ? market.prev_close : market.prev_close * rate);
            const pUsd = isINR
                ? +((market.prev_close || pInr) / rate).toFixed(2)
                : market.prev_close;
            if (mode === 'USD') return fUSD(pUsd);
            if (mode === 'INR') return fINR(pInr);
            return isINR ? `${fINR(pInr)} / ${fUSD(pUsd)}` : `${fUSD(pUsd)} / ${fINR(pInr)}`;
        };

        const setCard = (id, label, value, sub) => {
            const card = document.getElementById(id);
            if (!card) return;
            const lEl = card.querySelector('.stat-label');
            const vEl = card.querySelector('.stat-value');
            const sEl = card.querySelector('.stat-sub');
            if (lEl) lEl.textContent = label;
            if (vEl) vEl.textContent = value;
            if (sEl) sEl.textContent = sub;
        };

        const highVal = fHL('unit_high_usd', 'unit_high_inr') !== '—'
            ? fHL('unit_high_usd', 'unit_high_inr')
            : fHL('day_high_usd', 'day_high_inr');
        const lowVal = fHL('unit_low_usd', 'unit_low_inr') !== '—'
            ? fHL('unit_low_usd', 'unit_low_inr')
            : fHL('day_low_usd', 'day_low_inr');

        setCard('stat-sma10', 'Day High', highVal, 'High');
        setCard('stat-sma20', 'Day Low', lowVal, 'Low');
        setCard('stat-ema10', 'Prev Close', fPrev(), 'Close');
        setCard('stat-ema20', 'Day Change', `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`, 'vs yesterday');
        setCard('stat-vol', 'Status', market.market_state || '—', 'Market');
        setCard('stat-chg', 'Volume', market.volume ? '$' + (market.volume / 1e9).toFixed(2) + 'B' : '—', 'Vol 24h');

        const chgEl = document.querySelector('#stat-ema20 .stat-value');
        if (chgEl) chgEl.style.color = changePct >= 0 ? 'var(--green)' : 'var(--red)';
        return;
    }

    // ── Crypto path — restore labels then populate ─────────
    if (!analytics) return;

    const restoreLabel = (id, label, sub) => {
        const card = document.getElementById(id);
        if (!card) return;
        const lEl = card.querySelector('.stat-label');
        const sEl = card.querySelector('.stat-sub');
        if (lEl) lEl.textContent = label;
        if (sEl) sEl.textContent = sub;
        const vEl = card.querySelector('.stat-value');
        if (vEl) vEl.style.color = '';
    };
    restoreLabel('stat-sma10', 'SMA 10', 'Simple MA');
    restoreLabel('stat-sma20', 'SMA 20', 'Simple MA');
    restoreLabel('stat-ema10', 'EMA 10', 'Exp MA');
    restoreLabel('stat-ema20', 'EMA 20', 'Exp MA');
    restoreLabel('stat-vol', 'Volatility', 'Std Dev %');
    restoreLabel('stat-chg', 'Change', 'Window %');

    const fS = window.formatStatPrice || window.formatUSD;
    document.querySelector('#stat-sma10 .stat-value').textContent = fS(analytics.sma_10);
    document.querySelector('#stat-sma20 .stat-value').textContent = fS(analytics.sma_20);
    document.querySelector('#stat-ema10 .stat-value').textContent = fS(analytics.ema_10);
    document.querySelector('#stat-ema20 .stat-value').textContent = fS(analytics.ema_20);
    document.querySelector('#stat-vol   .stat-value').textContent = fmtPct(analytics.volatility);
    document.querySelector('#stat-chg   .stat-value').textContent = fmtPct(analytics.change_pct);

    const chgEl = document.querySelector('#stat-chg .stat-value');
    if (chgEl) chgEl.style.color = analytics.change_pct >= 0 ? 'var(--green)' : 'var(--red)';
};

// ── Alert display ──────────────────────────────────────────
const showAlert = (alert) => {
    const el = document.createElement('div');
    el.className = `alert-item alert-item--${alert.severity}`;
    el.innerHTML = `<strong>[${alert.type}]</strong> ${alert.message}`;
    alertContainer.prepend(el);
    setTimeout(() => el.remove(), 8000);
};

// ── Tab navigation ─────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');

        if (btn.dataset.tab === 'portfolio' && window.Portfolio) window.Portfolio.reload();
        if (btn.dataset.tab === 'markets' && window.Markets) window.Markets.refreshMarkets();
        if (btn.dataset.tab === 'sentiment' && window.SentimentUI?.fetchSentimentDirect) {
            window.SentimentUI.fetchSentimentDirect();
        }
    });
});

// Refresh button for sentiment tab
document.getElementById('sentiment-refresh-btn')
    ?.addEventListener('click', () => window.SentimentUI?.fetchSentimentDirect?.());