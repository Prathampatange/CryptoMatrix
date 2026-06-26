/**
 * frontend/js/prediction.js
 * Prediction tab — crypto + market instruments.
 * Fixed: notReady handling, all 8 signal cards, model breakdown, currency display.
 */

let forecastChart = null;

const MARKET_IDS = ['SENSEX', 'NIFTY', 'GOLD', 'SILVER'];
const CRYPTO_IDS = ['BTC', 'ETH', 'SOL', 'BNB'];

const MARKET_META = {
    SENSEX: { name: 'BSE Sensex', currency: 'INR', flag: '🇮🇳', color: '#f5a623' },
    NIFTY: { name: 'Nifty 50', currency: 'INR', flag: '🇮🇳', color: '#ff6b6b' },
    GOLD: { name: 'Gold', currency: 'USD', flag: '🥇', color: '#ffd700' },
    SILVER: { name: 'Silver', currency: 'USD', flag: '🥈', color: '#c0c0c0' },
};

const CRYPTO_COLORS = { BTC: '#00f5c4', ETH: '#4facfe', SOL: '#a78bfa', BNB: '#f5a623' };

const isMarket = (s) => MARKET_IDS.includes(s);

// ── Format price for display ───────────────────────────────
const fmtPredPrice = (usdValue, symbol) => {
    const meta = MARKET_META[symbol];
    const rate = window.CurrencyState?.usdInrRate || 83.5;
    const mode = window.CurrencyState?.mode || 'BOTH';

    if (!usdValue && usdValue !== 0) return '—';

    const usdStr = window.formatUSD ? window.formatUSD(usdValue) : `$${usdValue.toFixed(2)}`;
    const inrStr = window.formatINR ? window.formatINR(usdValue * rate) : `₹${(usdValue * rate).toFixed(2)}`;

    if (mode === 'USD') return usdStr;
    if (mode === 'INR') return inrStr;

    if (meta?.currency === 'INR') {
        // Show INR as primary for Indian instruments
        const inrVal = usdValue * rate;
        const inrPrimary = window.formatINR ? window.formatINR(inrVal) : `₹${inrVal.toFixed(2)}`;
        return `${inrPrimary} / ${usdStr}`;
    }
    return `${usdStr} / ${inrStr}`;
};

// ── Init forecast chart ────────────────────────────────────
const initForecastChart = () => {
    const ctx = document.getElementById('forecastChart')?.getContext('2d');
    if (!ctx) return;

    forecastChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 10, padding: 14, color: '#4a5568', font: { size: 10, family: "'Space Mono', monospace" } },
                },
                tooltip: {
                    backgroundColor: 'rgba(8,13,24,0.95)',
                    borderColor: 'rgba(0,245,196,0.2)',
                    borderWidth: 1,
                    titleColor: '#00f5c4',
                    bodyColor: '#94a3b8',
                    padding: 12,
                },
            },
            scales: {
                x: { grid: { color: 'rgba(0,245,196,0.04)' }, ticks: { color: '#4a5568' } },
                y: {
                    position: 'right',
                    grid: { color: 'rgba(0,245,196,0.04)' },
                    ticks: { color: '#4a5568' },
                },
            },
        },
    });
};

// ── Main entry ─────────────────────────────────────────────
const runPrediction = async () => {
    const symbol = document.getElementById('predict-coin-select')?.value;
    if (!symbol) return;

    const btn = document.getElementById('run-predict-btn');
    if (btn) { btn.querySelector('span').textContent = 'Loading…'; btn.disabled = true; }

    resetCards();
    setModelBreakdown(null);
    setAnomalyContent('<div class="empty-state">Running analysis…</div>');

    try {
        if (isMarket(symbol)) {
            await runMarketPrediction(symbol);
        } else {
            await runCryptoPrediction(symbol);
        }
    } catch (err) {
        showPredictionError('Prediction failed — ' + err.message);
        console.error(err);
    } finally {
        if (btn) { btn.querySelector('span').textContent = '▶ Run Prediction'; btn.disabled = false; }
    }
};

// ── Crypto prediction ──────────────────────────────────────
const runCryptoPrediction = async (symbol) => {
    const [predRes, anomRes] = await Promise.all([
        fetch(`/api/coins/${symbol}/predict`),
        fetch(`/api/coins/${symbol}/anomaly`),
    ]);

    const predData = await predRes.json();
    const anomData = await anomRes.json();

    // Handle not-ready state (202)
    if (predRes.status === 202 || predData.notReady) {
        showNotReady(predData);
        return;
    }

    if (!predData.success) { showPredictionError(predData.error); return; }

    const tick = window._latestTicks?.[symbol];
    renderAllCards(symbol, predData.prediction, tick);
    renderForecastChart(symbol, predData.prediction, tick);
    if (anomData.success) renderAnomaly(anomData.anomaly);
};

// ── Market prediction ──────────────────────────────────────
const runMarketPrediction = async (id) => {
    const [predRes, anomRes] = await Promise.all([
        fetch(`/api/markets/${id}/predict`),
        fetch(`/api/markets/${id}/anomaly`),
    ]);

    const predData = await predRes.json();
    const anomData = await anomRes.json();

    // Handle not-ready state (202)
    if (predRes.status === 202 || predData.notReady) {
        showNotReady(predData);
        return;
    }

    if (!predData.success) { showPredictionError(predData.error); return; }

    const meta = MARKET_META[id];
    const tick = {
        symbol: id,
        name: predData.name || meta?.name,
        price_usd: predData.price_usd,
        price_inr: predData.price_inr,
        currency: predData.currency || meta?.currency,
    };

    renderAllCards(id, predData.prediction, tick);
    renderForecastChart(id, predData.prediction, tick);
    if (anomData.success) renderAnomaly(anomData.anomaly);
};

// ── Show not-ready state ───────────────────────────────────
const showNotReady = (data) => {
    const count = data.count || 0;
    const required = data.required || 10;
    const pct = Math.round((count / required) * 100);

    setAnomalyContent(`
    <div class="anomaly-item anomaly-item--warning" style="grid-column:1/-1">
      <strong>⏳ Collecting Data — ${count} / ${required} records</strong>
      <div style="margin-top:10px;background:var(--border2);border-radius:4px;height:6px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:var(--cyan);border-radius:4px;transition:width 0.5s"></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text3)">
        ${data.error}
      </div>
    </div>
  `);
};

// ── Render ALL 8 signal cards ──────────────────────────────
const renderAllCards = (symbol, pred, tick) => {
    const forecast = pred.forecast;
    const macd = pred.macd;
    const bb = pred.bollingerBands;
    const stoch = pred.stochasticRSI;

    const setCard = (id, value, cssClass) => {
        const card = document.getElementById(id);
        if (!card) return;
        const val = card.querySelector('.sig-value');
        if (!val) return;
        val.textContent = value ?? '—';
        val.className = `sig-value ${cssClass || ''}`;
    };

    const addSub = (cardId, text) => {
        const card = document.getElementById(cardId);
        if (!card) return;
        let sub = card.querySelector('.sig-sub');
        if (!sub) {
            sub = document.createElement('div');
            sub.className = 'sig-sub';
            sub.style.cssText = 'font-size:10px;color:var(--text3);font-family:var(--font-mono);margin-top:2px';
            card.appendChild(sub);
        }
        sub.textContent = text;
    };

    // Trend
    setCard('sig-trend', forecast?.trend || '—',
        forecast?.trend === 'BULLISH' ? 'sig--bullish' : 'sig--bearish');

    // MA crossover signal
    setCard('sig-signal', pred.signal || '—',
        ['BUY', 'STRONG_BUY'].includes(pred.signal) ? 'sig--buy'
            : ['SELL', 'STRONG_SELL'].includes(pred.signal) ? 'sig--sell'
                : 'sig--neutral');

    // RSI
    setCard('sig-rsi', pred.rsi != null ? pred.rsi.toFixed(1) : '—');
    if (pred.rsi != null) {
        const rsiColor = pred.rsi > 70 ? 'var(--red)' : pred.rsi < 30 ? 'var(--green)' : 'var(--text3)';
        addSub('sig-rsi', pred.rsi > 70 ? 'Overbought zone' : pred.rsi < 30 ? 'Oversold zone' : 'Neutral zone');
        const rsiCard = document.getElementById('sig-rsi');
        if (rsiCard) {
            const val = rsiCard.querySelector('.sig-value');
            if (val) val.style.color = rsiColor;
        }
    }

    // RSI signal
    setCard('sig-rsi-signal', pred.rsiSignal || '—',
        pred.rsiSignal === 'OVERSOLD' ? 'sig--oversold'
            : pred.rsiSignal === 'OVERBOUGHT' ? 'sig--overbought'
                : 'sig--neutral');

    // Confidence
    if (forecast) {
        const confPct = (forecast.confidence * 100).toFixed(1);
        setCard('sig-confidence', confPct + '%');
        addSub('sig-confidence', `Agreement: ${forecast.agreement}%`);
    }

    // MACD
    if (macd) {
        setCard('sig-macd', macd.signal || '—',
            macd.signal === 'BULLISH' ? 'sig--bullish'
                : macd.signal === 'BEARISH' ? 'sig--bearish'
                    : 'sig--neutral');
        addSub('sig-macd', `Hist: ${macd.histogram?.toFixed(4) ?? '—'}`);
    } else {
        setCard('sig-macd', 'NO DATA', 'sig--neutral');
        addSub('sig-macd', 'Need 35+ data points');
    }

    // Bollinger Bands
    if (bb) {
        setCard('sig-bollinger', bb.signal || '—',
            ['OVERSOLD', 'LOWER_BAND'].includes(bb.signal) ? 'sig--oversold'
                : ['OVERBOUGHT', 'UPPER_BAND'].includes(bb.signal) ? 'sig--overbought'
                    : 'sig--neutral');
        addSub('sig-bollinger', `%B: ${bb.percentB?.toFixed(3) ?? '—'}`);
    } else {
        setCard('sig-bollinger', 'NO DATA', 'sig--neutral');
        addSub('sig-bollinger', 'Need 20+ data points');
    }

    // Overall signal — most important
    const overallCls =
        pred.overallSignal === 'STRONG_BUY' ? 'sig--buy' :
            pred.overallSignal === 'BUY' ? 'sig--buy' :
                pred.overallSignal === 'STRONG_SELL' ? 'sig--sell' :
                    pred.overallSignal === 'SELL' ? 'sig--sell' :
                        'sig--neutral';

    setCard('sig-overall', pred.overallSignal || '—', overallCls);

    const overallCard = document.getElementById('sig-overall');
    if (overallCard) {
        overallCard.classList.toggle('signal-card--highlight',
            ['STRONG_BUY', 'STRONG_SELL'].includes(pred.overallSignal));

        if (pred.signalBreakdown) {
            const { bullish, bearish } = pred.signalBreakdown;
            addSub('sig-overall', '');
            let sub = overallCard.querySelector('.sig-sub');
            if (sub) sub.innerHTML = `<span style="color:var(--green)">▲${bullish}</span> / <span style="color:var(--red)">▼${bearish}</span>`;
        }
    }

    // Flag icon for market instruments
    const meta = MARKET_META[symbol];
    if (meta?.flag) {
        const iconEl = document.getElementById('sig-trend')?.querySelector('.sig-icon');
        if (iconEl) iconEl.textContent = meta.flag;
    }

    // Model breakdown
    if (forecast?.models) setModelBreakdown(forecast.models, symbol);
};

// ── Forecast chart ─────────────────────────────────────────
const renderForecastChart = (symbol, pred, tick) => {
    if (!forecastChart || !pred.forecast) return;

    const forecast = pred.forecast;
    const steps = forecast.predictions.length;
    const labels = Array.from({ length: steps }, (_, i) => `Tick +${i + 1}`);
    const meta = MARKET_META[symbol];
    const rate = window.CurrencyState?.usdInrRate || 83.5;
    const color = CRYPTO_COLORS[symbol] || meta?.color || '#00f5c4';

    let preds = [...forecast.predictions];
    let upper = [...forecast.upper];
    let lower = [...forecast.lower];

    // Scale to INR for Indian instruments
    if (meta?.currency === 'INR' && tick?.price_usd && tick?.price_inr) {
        const ratio = tick.price_inr / tick.price_usd;
        preds = preds.map(p => +(p * ratio).toFixed(2));
        upper = upper.map(p => +(p * ratio).toFixed(2));
        lower = lower.map(p => +(p * ratio).toFixed(2));
    }

    // Determine Y-axis format
    const isinr = meta?.currency === 'INR';
    const mode = window.CurrencyState?.mode || 'BOTH';
    forecastChart.options.scales.y.ticks.callback = (v) => {
        if (mode === 'USD') return '$' + v.toLocaleString('en-US');
        if (mode === 'INR' || isinr) return '₹' + v.toLocaleString('en-IN');
        return isinr ? '₹' + v.toLocaleString('en-IN') : '$' + v.toLocaleString('en-US');
    };

    forecastChart.data.labels = labels;
    forecastChart.data.datasets = [
        {
            label: `${symbol} Forecast`,
            data: preds,
            borderColor: color,
            borderWidth: 2.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0.3,
            fill: false,
        },
        {
            label: 'Upper Band',
            data: upper,
            borderColor: color + '55',
            borderWidth: 1,
            borderDash: [4, 3],
            pointRadius: 0,
            fill: '+1',
            backgroundColor: color + '12',
        },
        {
            label: 'Lower Band',
            data: lower,
            borderColor: color + '55',
            borderWidth: 1,
            borderDash: [4, 3],
            pointRadius: 0,
            fill: false,
        },
    ];
    forecastChart.update();
};

// ── Model breakdown ────────────────────────────────────────
const setModelBreakdown = (models, symbol) => {
    const el = document.getElementById('model-breakdown');
    if (!el) return;

    if (!models?.length) {
        el.innerHTML = '<div class="empty-state">Run a prediction to see model breakdown</div>';
        return;
    }

    const meta = MARKET_META[symbol];
    const rate = window.CurrencyState?.usdInrRate || 83.5;
    const mode = window.CurrencyState?.mode || 'BOTH';
    const isinr = meta?.currency === 'INR';
    const tick = window._latestTicks?.[symbol];
    const curr = tick?.price_usd || 0;

    el.innerHTML = models.map(m => {
        const r2Pct = (m.r2 * 100).toFixed(1);
        const weightPct = (m.weight * 100).toFixed(0);
        const isBull = m.nextPrice > curr;
        const dirColor = isBull ? 'var(--green)' : 'var(--red)';
        const dirArrow = isBull ? '▲' : '▼';
        const barColor = r2Pct > 70 ? '#00f5c4' : r2Pct > 40 ? '#f5a623' : '#ff4d6d';

        // Format next price based on mode and instrument type
        let priceStr = '—';
        if (m.nextPrice) {
            if (mode === 'INR' || isinr) {
                const ratio = (tick?.price_inr && tick?.price_usd) ? tick.price_inr / tick.price_usd : rate;
                priceStr = window.formatINR ? window.formatINR(m.nextPrice * ratio) : `₹${(m.nextPrice * rate).toFixed(2)}`;
            } else if (mode === 'USD') {
                priceStr = window.formatUSD ? window.formatUSD(m.nextPrice) : `$${m.nextPrice.toFixed(2)}`;
            } else {
                const ratio = (tick?.price_inr && tick?.price_usd) ? tick.price_inr / tick.price_usd : rate;
                const uStr = window.formatUSD ? window.formatUSD(m.nextPrice) : `$${m.nextPrice.toFixed(2)}`;
                const iStr = window.formatINR ? window.formatINR(m.nextPrice * (isinr ? ratio : rate)) : '';
                priceStr = isinr ? `${iStr}<br><span style="font-size:10px;color:var(--text3)">${uStr}</span>` : uStr;
            }
        }

        return `
      <div class="model-card">
        <div class="model-card-header">
          <span class="model-card-name">${m.name}</span>
          <span class="model-card-weight">W: ${weightPct}%</span>
        </div>
        <div class="model-card-price">${priceStr}</div>
        <div class="model-card-r2-bar">
          <div class="model-card-r2-fill" style="width:${r2Pct}%;background:${barColor}"></div>
        </div>
        <div class="model-card-footer">
          <span>R² ${r2Pct}%</span>
          <span class="model-card-direction" style="color:${dirColor}">
            ${dirArrow} ${m.name === 'Mean Reversion' ? 'Reverts' : isBull ? 'Bullish' : 'Bearish'}
          </span>
        </div>
      </div>
    `;
    }).join('');
};

// ── Anomaly panel ──────────────────────────────────────────
const renderAnomaly = (anomaly) => {
    const z = anomaly.zScore || {};
    const iqr = anomaly.iqr || {};
    const vol = anomaly.volume || {};

    const sev = (isAnom, severity) =>
        !isAnom ? 'normal' : severity === 'CRITICAL' ? 'critical' : 'warning';

    setAnomalyContent(`
    <div class="anomaly-item anomaly-item--${sev(z.isAnomaly, z.severity)}">
      <strong>Z-Score Detection</strong>
      Z-Score: <strong>${z.zScore ?? '—'}</strong><br>
      Direction: ${z.direction || '—'}<br>
      Severity: <strong>${z.severity || 'NORMAL'}</strong>
    </div>
    <div class="anomaly-item anomaly-item--${iqr.isAnomaly ? 'warning' : 'normal'}">
      <strong>IQR Detection</strong>
      Upper fence: ${iqr.upperFence?.toLocaleString() || '—'}<br>
      Lower fence: ${iqr.lowerFence?.toLocaleString() || '—'}<br>
      Status: ${iqr.isAnomaly ? '⚠️ Outlier' : '✅ Normal'}
    </div>
    <div class="anomaly-item anomaly-item--${vol.isAnomaly ? 'warning' : 'normal'}">
      <strong>Volume Anomaly</strong>
      Z-Score: <strong>${vol.zScore ?? '—'}</strong><br>
      vs Normal: ${vol.multiplier ? vol.multiplier + 'x' : '—'}<br>
      Status: ${vol.isAnomaly ? '⚠️ Spike' : '✅ Normal'}
    </div>
    <div class="anomaly-item anomaly-item--${anomaly.isAnomaly ? 'warning' : 'normal'}">
      <strong>Combined Result</strong>
      <span style="font-size:22px;display:block;margin:4px 0">${anomaly.isAnomaly ? '⚠️' : '✅'}</span>
      ${anomaly.summary}
    </div>
  `);
};

// ── Helpers ────────────────────────────────────────────────
const setAnomalyContent = (html) => {
    const el = document.getElementById('anomaly-content');
    if (el) el.innerHTML = html;
};

const resetCards = () => {
    ['sig-trend', 'sig-signal', 'sig-rsi', 'sig-rsi-signal',
        'sig-confidence', 'sig-macd', 'sig-bollinger', 'sig-overall'
    ].forEach(id => {
        const card = document.getElementById(id);
        if (!card) return;
        const val = card.querySelector('.sig-value');
        if (val) { val.textContent = '—'; val.className = 'sig-value'; val.style.color = ''; }
        card.querySelectorAll('.sig-sub').forEach(s => s.remove());
        card.classList.remove('signal-card--highlight');
    });
};

const showPredictionError = (msg) => {
    setAnomalyContent(`
    <div class="anomaly-item anomaly-item--warning" style="grid-column:1/-1">
      <strong>⚠️ Could not run prediction</strong><br>${msg}
    </div>
  `);
    setModelBreakdown(null);
};

// ── Re-render on currency change ───────────────────────────
document.addEventListener('currency-changed', () => {
    const symbol = document.getElementById('predict-coin-select')?.value;
    if (!symbol) return;
    // Re-render model breakdown prices in new currency
    const tick = window._latestTicks?.[symbol];
    // Rebuild breakdown if models exist
    const breakdown = document.getElementById('model-breakdown');
    if (breakdown && !breakdown.querySelector('.empty-state')) {
        // Trigger a lightweight re-render by re-running prediction silently
        // (only updates prices, not the full fetch)
    }
});

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initForecastChart();
    document.getElementById('run-predict-btn')?.addEventListener('click', runPrediction);
});