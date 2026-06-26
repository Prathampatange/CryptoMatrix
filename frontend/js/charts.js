/**
 * frontend/js/charts.js — Chart.js config with CryptoMatrix theme.
 *
 * FIXES applied:
 * 1. window.CryptoCharts assigned FIRST — eliminates the stale-reference
 *    bug where _pendingRender was written to undefined and silently lost.
 * 2. Shared _state object — all closures reference the same pointer so
 *    pendingRender is always visible to initChart() when it runs.
 * 3. maintainAspectRatio: false — required when the parent container has
 *    an explicit CSS height. Without this, Chart.js ignores the container
 *    height and can render at 0px (blank canvas).
 * 4. pushTick() auto-renders the active symbol as data arrives, so the
 *    chart doesn't depend solely on app.js calling renderChart().
 */

if (!window.CryptoCharts) {

    const MAX_POINTS = 60;

    const COLORS = {
        price: '#00f5c4',
        sma10: '#f5a623',
        sma20: '#ff4d6d',
        ema10: '#4facfe',
        ema20: '#a78bfa',
    };

    const MARKET_COLORS = {
        SENSEX: '#f5a623',
        NIFTY: '#ff6b6b',
        GOLD: '#ffd700',
        SILVER: '#c0c0c0',
    };

    const MARKET_SYMBOLS = new Set(['SENSEX', 'NIFTY', 'GOLD', 'SILVER']);

    // One shared state object — every closure reads/writes the same reference
    const _state = {
        chart: null,
        pendingRender: null,
        initStarted: false,
    };

    const EMPTY_BUF = () => ({
        labels: [], price: [], sma10: [], sma20: [], ema10: [], ema20: [], volume: []
    });

    const buffers = {
        BTC: EMPTY_BUF(),
        ETH: EMPTY_BUF(),
        SOL: EMPTY_BUF(),
        BNB: EMPTY_BUF(),
        SENSEX: EMPTY_BUF(),
        NIFTY: EMPTY_BUF(),
        GOLD: EMPTY_BUF(),
        SILVER: EMPTY_BUF(),
    };

    // ── Push tick data into buffer ─────────────────────────
    const pushTick = (symbol, tick, analytics) => {
        const buf = buffers[symbol];
        if (!buf) return;

        const label = new Date(tick.timestamp || Date.now()).toLocaleTimeString();
        const push = (arr, val) => {
            arr.push(val ?? null);
            if (arr.length > MAX_POINTS) arr.shift();
        };

        let chartPrice;
        if (MARKET_SYMBOLS.has(symbol)) {
            chartPrice = ['SENSEX', 'NIFTY'].includes(symbol)
                ? (tick.price_inr || tick.price_usd * (window.CurrencyState?.usdInrRate || 83.5))
                : (tick.price_usd || 0);
        } else {
            chartPrice = tick.price_usd;
        }

        push(buf.labels, label);
        push(buf.price, chartPrice);

        if (!MARKET_SYMBOLS.has(symbol)) {
            push(buf.sma10, analytics?.sma_10 ?? null);
            push(buf.sma20, analytics?.sma_20 ?? null);
            push(buf.ema10, analytics?.ema_10 ?? null);
            push(buf.ema20, analytics?.ema_20 ?? null);
        } else {
            const prices = buf.price.filter(v => v != null);
            const sma = (arr, p) =>
                arr.length >= p ? arr.slice(-p).reduce((s, v) => s + v, 0) / p : null;
            push(buf.sma10, sma(prices, 10));
            push(buf.sma20, sma(prices, 20));
            push(buf.ema10, null);
            push(buf.ema20, null);
        }

        push(buf.volume, tick.volume_24h ?? 0);

        // Auto-render whenever the active symbol gets new data
        if (_state.chart && _state.chart._currentSymbol === symbol) {
            _doRender(symbol);
        }
    };

    // Internal render — only called when chart exists and buffer has data
    const _doRender = (symbol) => {
        const buf = buffers[symbol];
        if (!buf || !buf.price.length) return;

        _state.chart._currentSymbol = symbol;

        const priceColor = MARKET_COLORS[symbol] || COLORS.price;
        _state.chart.data.datasets[0].borderColor = priceColor;
        _state.chart.data.datasets[0].backgroundColor = (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
            g.addColorStop(0, priceColor + '30');
            g.addColorStop(1, priceColor + '00');
            return g;
        };

        _state.chart.data.datasets[1].hidden = false;
        _state.chart.data.datasets[2].hidden = false;
        _state.chart.data.datasets[3].hidden = true;
        _state.chart.data.datasets[4].hidden = true;

        _state.chart.data.labels = [...buf.labels];
        _state.chart.data.datasets[0].data = [...buf.price];
        _state.chart.data.datasets[1].data = buf.sma10.map(v => v ?? null);
        _state.chart.data.datasets[2].data = buf.sma20.map(v => v ?? null);
        _state.chart.data.datasets[3].data = buf.ema10.map(v => v ?? null);
        _state.chart.data.datasets[4].data = buf.ema20.map(v => v ?? null);

        _state.chart.update('none');
    };

    // ── Public API called by app.js ────────────────────────
    const renderChart = (symbol) => {
        if (!_state.chart) {
            _state.pendingRender = symbol;
            initChart(); // try now — maybe DOM is ready
            return;
        }
        _state.chart._currentSymbol = symbol;
        _doRender(symbol);
    };

    // ── Create the Chart.js instance ───────────────────────
    const initChart = () => {
        if (_state.chart) return;

        const canvas = document.getElementById('priceChart');
        if (!canvas) {
            if (!_state.initStarted) {
                _state.initStarted = true;
                const timer = setInterval(() => {
                    if (document.getElementById('priceChart')) {
                        clearInterval(timer);
                        initChart();
                    }
                }, 100);
            }
            return;
        }

        Chart.defaults.color = '#4a5568';
        Chart.defaults.borderColor = 'rgba(0,245,196,0.06)';
        Chart.defaults.font.family = "'Space Mono', monospace";
        Chart.defaults.font.size = 10;

        _state.chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Price',
                        data: [],
                        borderColor: COLORS.price,
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true,
                        backgroundColor: (ctx) => {
                            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
                            g.addColorStop(0, 'rgba(0,245,196,0.15)');
                            g.addColorStop(1, 'rgba(0,245,196,0)');
                            return g;
                        },
                        yAxisID: 'y',
                    },
                    {
                        label: 'SMA 10',
                        data: [],
                        borderColor: COLORS.sma10,
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false,
                        borderDash: [5, 3],
                        yAxisID: 'y',
                    },
                    {
                        label: 'SMA 20',
                        data: [],
                        borderColor: COLORS.sma20,
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false,
                        borderDash: [5, 3],
                        yAxisID: 'y',
                    },
                    {
                        label: 'EMA 10',
                        data: [],
                        borderColor: COLORS.ema10,
                        borderWidth: 1,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false,
                        hidden: true,
                        yAxisID: 'y',
                    },
                    {
                        label: 'EMA 20',
                        data: [],
                        borderColor: COLORS.ema20,
                        borderWidth: 1,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false,
                        hidden: true,
                        yAxisID: 'y',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,   // ← CRITICAL: lets the CSS height drive the canvas
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 10,
                            padding: 16,
                            color: '#4a5568',
                            font: { size: 10, family: "'Space Mono', monospace" },
                        },
                    },
                    tooltip: {
                        backgroundColor: 'rgba(8,13,24,0.95)',
                        borderColor: 'rgba(0,245,196,0.2)',
                        borderWidth: 1,
                        titleColor: '#00f5c4',
                        bodyColor: '#94a3b8',
                        padding: 12,
                        callbacks: {
                            label: (c) => {
                                if (c.raw == null) return null;
                                const sym = _state.chart?._currentSymbol || '';
                                if (MARKET_SYMBOLS.has(sym)) {
                                    const rate = window.CurrencyState?.usdInrRate || 83.5;
                                    const isINR = ['SENSEX', 'NIFTY'].includes(sym);
                                    const usdVal = isINR ? c.raw / rate : c.raw;
                                    const inrVal = isINR ? c.raw : c.raw * rate;
                                    return ` ${c.dataset.label}: $${usdVal.toLocaleString('en-US', { minimumFractionDigits: 2 })} / ₹${inrVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                                }
                                return ` ${c.dataset.label}: $${c.raw?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(0,245,196,0.04)' },
                        ticks: { maxTicksLimit: 8, color: '#4a5568' },
                    },
                    y: {
                        position: 'right',
                        grid: { color: 'rgba(0,245,196,0.04)' },
                        ticks: {
                            color: '#4a5568',
                            callback: (v) => {
                                const sym = _state.chart?._currentSymbol || '';
                                if (['SENSEX', 'NIFTY'].includes(sym)) return '₹' + v.toLocaleString('en-IN');
                                if (MARKET_SYMBOLS.has(sym)) return '$' + v.toLocaleString('en-US');
                                return '$' + v.toLocaleString();
                            },
                        },
                    },
                },
            },
        });

        // Flush any render that was queued before the chart was ready
        if (_state.pendingRender) {
            renderChart(_state.pendingRender);
            _state.pendingRender = null;
        }
    };

    // ── Expose API BEFORE any async work so app.js never hits undefined ──
    window.CryptoCharts = { pushTick, renderChart };

    // ── Boot ───────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChart);
    } else {
        initChart(); // scripts are at bottom of <body>, DOM is already ready
    }

} // end guard