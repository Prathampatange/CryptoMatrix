/**
 * frontend/js/markets.js
 * Markets tab — Sensex, Nifty, Gold, Silver with full dual currency + unit pricing.
 * Wrapped in an IIFE guard to prevent "already declared" errors if loaded twice.
 */

if (!window.Markets) {

    let marketChart = null;
    let latestMarkets = {};
    const marketBuffer = { SENSEX: [], NIFTY: [], GOLD: [], SILVER: [] };
    const MAX_POINTS = 60;

    const MARKET_COLORS = {
        SENSEX: '#f5a623', NIFTY: '#ff6b6b', GOLD: '#ffd700', SILVER: '#c0c0c0',
    };

    // ── Init chart ─────────────────────────────────────────────
    const initMarketChart = () => {
        const ctx = document.getElementById('marketChart')?.getContext('2d');
        if (!ctx) return;

        marketChart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
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
                    x: { grid: { color: 'rgba(0,245,196,0.04)' }, ticks: { maxTicksLimit: 8, color: '#4a5568' } },
                    y: { position: 'right', grid: { color: 'rgba(0,245,196,0.04)' }, ticks: { color: '#4a5568' } },
                },
            },
        });

        document.getElementById('market-chart-select')?.addEventListener('change', (e) => {
            renderMarketChart(e.target.value);
            updateMarketStats(e.target.value);
        });
    };

    // ── Render market cards ────────────────────────────────────
    const renderMarketCards = (markets) => {
        console.log('--- renderMarketCards Triggered ---');
        console.log('Markets array:', markets);
        const grid = document.getElementById('market-cards-grid');
        console.log('Found grid element?', !!grid);
        if (!markets?.length || !grid) return;

        try {
            // Always clear the loading/empty state first
            const emptyState = grid.querySelector('.empty-state');
            if (emptyState) emptyState.remove();

            markets.forEach(m => {
                console.log('Processing market:', m.id);
                latestMarkets[m.id] = m;

                const buf = marketBuffer[m.id];
                if (buf) {
                    buf.push({ price: m.price, label: new Date(m.timestamp).toLocaleTimeString() });
                    if (buf.length > MAX_POINTS) buf.shift();
                }

                renderOneCard(m, grid);
            });

            const selected = document.getElementById('market-chart-select')?.value || 'SENSEX';
            renderMarketChart(selected);
            updateMarketStats(selected);
        } catch (err) { console.error(err); }
    };

    const renderOneCard = (m, grid) => {
        const up = m.change_pct >= 0;
        const arrow = up ? '▲' : '▼';
        const cls = up ? 'change--up' : 'change--down';
        const isOpen = ['REGULAR', 'PRE', 'POST'].includes(m.market_state);
        const mode = window.CurrencyState?.mode || 'BOTH';

        // ── Unit price display ─────────────────────────────────
        const unitUsd = m.unit_price_usd || m.price_usd;
        const unitInr = m.unit_price_inr || m.price_inr;

        const usdStr = window.formatUSD ? window.formatUSD(unitUsd) : `$${unitUsd}`;
        const inrStr = window.formatINR ? window.formatINR(unitInr) : `₹${unitInr}`;

        const primary = m.currency === 'INR' ? inrStr : usdStr;
        const secondary = m.currency === 'INR' ? usdStr : inrStr;

        let priceHTML = '';
        if (mode === 'USD') {
            priceHTML = `<div class="card-price-usd" style="font-size:21px">${usdStr}</div>`;
        } else if (mode === 'INR') {
            priceHTML = `<div class="card-price-usd" style="font-size:21px">${inrStr}</div>`;
        } else {
            priceHTML = `
      <div class="card-price-usd" style="font-size:21px">${primary}</div>
      <div class="card-price-inr">${secondary}</div>
    `;
        }

        // ── Day range ──────────────────────────────────────────
        const highInr = window.formatINR ? window.formatINR(m.unit_high_inr || m.day_high_inr) : `₹${m.day_high_inr}`;
        const lowInr = window.formatINR ? window.formatINR(m.unit_low_inr || m.day_low_inr) : `₹${m.day_low_inr}`;
        const highUsd = window.formatUSD ? window.formatUSD(m.unit_high_usd || m.day_high_usd) : `$${m.day_high_usd}`;
        const lowUsd = window.formatUSD ? window.formatUSD(m.unit_low_usd || m.day_low_usd) : `$${m.day_low_usd}`;

        let rangeHTML = '';
        if (mode === 'USD') {
            rangeHTML = `<span>H: ${highUsd}</span><span>L: ${lowUsd}</span>`;
        } else if (mode === 'INR') {
            rangeHTML = `<span>H: ${highInr}</span><span>L: ${lowInr}</span>`;
        } else {
            rangeHTML = `
      <span>H: ${m.currency === 'INR' ? highInr : highUsd}</span>
      <span>L: ${m.currency === 'INR' ? lowInr : lowUsd}</span>
    `;
        }

        const card = document.createElement('div');
        card.className = 'price-card market-card';
        card.id = `mcard-${m.id}`;

        card.innerHTML = `
    <div class="card-header">
      <div class="coin-info">
        <div class="coin-name">${m.flag} ${m.name}</div>
        <div class="coin-symbol">${m.id}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="coin-rank" style="${isOpen ? 'color:var(--green);border-color:rgba(16,212,136,0.3)' : 'color:var(--text3)'}">
          ${isOpen ? '● OPEN' : '○ CLOSED'}
        </span>
        <span style="font-size:10px;color:var(--cyan);font-family:var(--font-mono);background:var(--cyan-dim);padding:2px 6px;border-radius:4px;border:1px solid rgba(0,245,196,0.2)">
          ${m.unit_label || m.category}
        </span>
      </div>
    </div>

    <div class="card-price-wrap">${priceHTML}</div>

    <div class="card-change ${cls}">
      ${arrow} ${Math.abs(m.change_pct).toFixed(2)}%
      <span style="color:var(--text3);font-weight:400">today</span>
    </div>

    <div class="card-meta" style="flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between">${rangeHTML}</div>
      ${m.unit_note ? `
      <div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);padding-top:4px;border-top:1px solid var(--border2)">
        ${m.unit_note}
      </div>` : ''}
    </div>
  `;

        const existing = document.getElementById(`mcard-${m.id}`);
        if (existing) {
            existing.replaceWith(card);
        } else {
            const empty = grid.querySelector('.empty-state');
            if (empty) empty.remove();
            grid.appendChild(card);
        }

        card.classList.add(up ? 'card-flash-up' : 'card-flash-down');
    };

    // ── Market chart ───────────────────────────────────────────
    const renderMarketChart = (id) => {
        if (!marketChart) return;
        const buf = marketBuffer[id] || [];
        const color = MARKET_COLORS[id] || '#00f5c4';

        marketChart.data.labels = buf.map(b => b.label);
        marketChart.data.datasets = [{
            label: id,
            data: buf.map(b => b.price),
            borderColor: color,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            fill: true,
            backgroundColor: (ctx) => {
                const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
                g.addColorStop(0, color + '30');
                g.addColorStop(1, color + '00');
                return g;
            },
        }];
        marketChart.update('none');
    };

    // ── Stats row ──────────────────────────────────────────────
    const updateMarketStats = (id) => {
        const m = latestMarkets[id];
        if (!m) return;

        const mode = window.CurrencyState?.mode || 'BOTH';
        const fUSD = window.formatUSD || (v => `$${v}`);
        const fINR = window.formatINR || (v => `₹${v}`);
        const up = m.change_pct >= 0;

        const unitUsd = m.unit_price_usd || m.price_usd;
        const unitInr = m.unit_price_inr || m.price_inr;

        // Price stat
        const priceEl = document.querySelector('#mstat-price .stat-value');
        if (priceEl) {
            if (mode === 'USD') {
                priceEl.textContent = fUSD(unitUsd);
            } else if (mode === 'INR') {
                priceEl.textContent = fINR(unitInr);
            } else {
                const primary = m.currency === 'INR' ? fINR(unitInr) : fUSD(unitUsd);
                const secondary = m.currency === 'INR' ? fUSD(unitUsd) : fINR(unitInr);
                priceEl.innerHTML = `${primary}<br><span style="font-size:12px;color:var(--text3)">${secondary}</span>`;
            }
        }

        const subEl = document.querySelector('#mstat-price .stat-sub');
        if (subEl) subEl.textContent = m.unit_label || 'Current';

        // High
        const highEl = document.querySelector('#mstat-high .stat-value');
        if (highEl) {
            const hUsd = m.unit_high_usd || m.day_high_usd;
            const hInr = m.unit_high_inr || m.day_high_inr;
            if (mode === 'USD') highEl.textContent = fUSD(hUsd);
            else if (mode === 'INR') highEl.textContent = fINR(hInr);
            else highEl.innerHTML = `${fINR(hInr)}<br><span style="font-size:11px;color:var(--text3)">${fUSD(hUsd)}</span>`;
        }

        // Low
        const lowEl = document.querySelector('#mstat-low .stat-value');
        if (lowEl) {
            const lUsd = m.unit_low_usd || m.day_low_usd;
            const lInr = m.unit_low_inr || m.day_low_inr;
            if (mode === 'USD') lowEl.textContent = fUSD(lUsd);
            else if (mode === 'INR') lowEl.textContent = fINR(lInr);
            else lowEl.innerHTML = `${fINR(lInr)}<br><span style="font-size:11px;color:var(--text3)">${fUSD(lUsd)}</span>`;
        }

        // Prev close
        const prevEl = document.querySelector('#mstat-prev .stat-value');
        if (prevEl) {
            const pInr = m.prev_close_inr || m.prev_close;
            const pUsd = m.currency === 'INR'
                ? +(m.prev_close / (window.CurrencyState?.usdInrRate || 83.5)).toFixed(2)
                : m.prev_close;
            if (mode === 'USD') prevEl.textContent = fUSD(pUsd);
            else if (mode === 'INR') prevEl.textContent = fINR(pInr);
            else prevEl.innerHTML = `${fINR(pInr)}<br><span style="font-size:11px;color:var(--text3)">${fUSD(pUsd)}</span>`;
        }

        // Change
        const chgEl = document.querySelector('#mstat-change .stat-value');
        if (chgEl) {
            chgEl.textContent = (up ? '+' : '') + m.change_pct.toFixed(2) + '%';
            chgEl.style.color = up ? 'var(--green)' : 'var(--red)';
        }

        // State
        const stateEl = document.querySelector('#mstat-state .stat-value');
        if (stateEl) {
            stateEl.textContent = m.market_state;
            stateEl.style.color = ['REGULAR', 'PRE', 'POST'].includes(m.market_state)
                ? 'var(--green)' : 'var(--text3)';
        }
    };

    // ── Load initial data ──────────────────────────────────────
    const loadMarkets = async () => {
        const grid = document.getElementById('market-cards-grid');
        if (grid) grid.innerHTML = '<div class="empty-state">Loading markets...</div>';
        try {
            const res = await fetch('/api/markets');
            const data = await res.json();
            if (data.success && data.data.length) renderMarketCards(data.data);
        } catch (err) {
            console.error('Market load error:', err);
            if (grid) grid.innerHTML = '<div class="empty-state">Failed to load market data.</div>';
        }
    };

    // ── Init ───────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        initMarketChart();

        // Fallback: if preloadMarkets in app.js didn't run, fetch after 2s
        setTimeout(() => {
            if (!Object.keys(latestMarkets).length) {
                console.warn('Fallback: Preload missed, fetching markets manually');
                loadMarkets();
            }
        }, 2000);

        // Re-render on currency mode change
        document.addEventListener('currency-changed', () => {
            const markets = Object.values(latestMarkets);
            if (markets.length) {
                const grid = document.getElementById('market-cards-grid');
                if (grid) markets.forEach(m => renderOneCard(m, grid));
                const selected = document.getElementById('market-chart-select')?.value || 'SENSEX';
                updateMarketStats(selected);
            }
        });

        document.addEventListener('rate-updated', () => {
            const markets = Object.values(latestMarkets);
            if (markets.length) {
                const grid = document.getElementById('market-cards-grid');
                if (grid) markets.forEach(m => renderOneCard(m, grid));
            }
        });

        document.addEventListener('rerender-markets', () => {
            const markets = Object.values(latestMarkets);
            if (markets.length) {
                const grid = document.getElementById('market-cards-grid');
                if (grid) markets.forEach(m => renderOneCard(m, grid));
                const selected = document.getElementById('market-chart-select')?.value || 'SENSEX';
                updateMarketStats(selected);
            }
        });
    });

    // ── Public refresh — called by tab click ───────────────────
    const refreshMarkets = () => {
        const grid = document.getElementById('market-cards-grid');
        if (!grid) return;

        try {
            const cached = Object.values(latestMarkets);
            if (cached.length) {
                grid.innerHTML = '';
                cached.forEach(m => renderOneCard(m, grid));
                const selected = document.getElementById('market-chart-select')?.value || 'SENSEX';
                renderMarketChart(selected);
                updateMarketStats(selected);
            } else {
                loadMarkets();
            }
        } catch (err) {
            console.error('Error in refreshMarkets:', err);
        }
    };

    // ── Expose public API ──────────────────────────────────────
    window.Markets = { renderMarketCards, loadMarkets, refreshMarkets };

} // end if (!window.Markets) guard