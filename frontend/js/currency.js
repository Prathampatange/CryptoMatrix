/**
 * frontend/js/currency.js
 * Global currency state and formatting.
 * Selecting USD / INR / BOTH re-renders ALL tabs instantly.
 */

window.CurrencyState = {
    mode: 'BOTH',
    usdInrRate: 83.5,
    source: 'fallback',
    updatedAt: null,
};

// ── Fetch live rate ────────────────────────────────────────
const fetchRate = async (force = false) => {
    try {
        const res = await fetch(force ? '/api/currency/rate?fresh=true' : '/api/currency/rate');
        const data = await res.json();
        if (data.success && data.usd_inr) {
            window.CurrencyState.usdInrRate = data.usd_inr;
            window.CurrencyState.source = data.source;
            window.CurrencyState.updatedAt = new Date(data.updated_at);
            updateRateDisplay();
            document.dispatchEvent(new CustomEvent('rate-updated', { detail: { rate: data.usd_inr } }));
        }
    } catch (err) {
        console.warn('Rate fetch failed:', err.message);
    }
};

const updateRateDisplay = () => {
    const el = document.getElementById('exchange-rate-display');
    if (el) {
        el.textContent = `1 USD = ₹${window.CurrencyState.usdInrRate.toFixed(2)}`;
        el.title = `Source: ${window.CurrencyState.source}`;
    }
};

// ── Core formatters ────────────────────────────────────────

window.formatUSD = (v, maxDec = 2) => {
    if (v == null || isNaN(v)) return '—';
    return '$' + parseFloat(v).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: maxDec,
    });
};

window.formatINR = (v) => {
    if (v == null || isNaN(v)) return '—';
    return '₹' + parseFloat(v).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

/**
 * Format a USD value based on current mode.
 * mode = 'USD' | 'INR' | 'BOTH'
 */
window.formatPrice = (usdValue, forceMode) => {
    const mode = forceMode || window.CurrencyState.mode;
    const rate = window.CurrencyState.usdInrRate;
    const inr = usdValue * rate;
    const dec = usdValue > 1000 ? 2 : usdValue > 1 ? 2 : 6;

    const usdStr = '$' + usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
    const inrStr = '₹' + inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (mode === 'USD') return usdStr;
    if (mode === 'INR') return inrStr;
    return `${usdStr} / ${inrStr}`;
};

/**
 * Build dual-currency HTML for a crypto tick price card.
 */
window.formatDualHTML = (tick) => {
    const mode = window.CurrencyState.mode;
    const rate = window.CurrencyState.usdInrRate;
    const inr = tick.price_inr || tick.price_usd * rate;
    const dec = tick.price_usd > 100 ? 2 : 6;

    const usdStr = '$' + tick.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
    const inrStr = '₹' + inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (mode === 'USD') return `<div class="card-price-usd">${usdStr}</div>`;
    if (mode === 'INR') return `<div class="card-price-usd">${inrStr}</div>`;
    return `<div class="card-price-usd">${usdStr}</div><div class="card-price-inr">${inrStr}</div>`;
};

/**
 * Build dual-currency HTML for a market instrument.
 * Respects native currency (INR for indices, USD for commodities).
 */
window.formatMarketDualHTML = (item) => {
    const mode = window.CurrencyState.mode;
    const usdStr = window.formatUSD(item.unit_price_usd || item.price_usd);
    const inrStr = window.formatINR(item.unit_price_inr || item.price_inr);

    // Primary = native currency of the instrument
    const primaryStr = item.currency === 'INR' ? inrStr : usdStr;
    const secondaryStr = item.currency === 'INR' ? usdStr : inrStr;

    if (mode === 'USD') return `<div class="card-price-usd">${usdStr}</div>`;
    if (mode === 'INR') return `<div class="card-price-usd">${inrStr}</div>`;
    // BOTH — primary large, secondary small
    return `
    <div class="card-price-usd">${primaryStr}</div>
    <div class="card-price-inr">${secondaryStr}</div>
  `;
};

/**
 * Format stat panel values (SMA, EMA etc.) by mode.
 */
window.formatStatPrice = (usdValue) => {
    if (usdValue == null) return '—';
    const mode = window.CurrencyState.mode;
    const rate = window.CurrencyState.usdInrRate;

    if (mode === 'USD') return window.formatUSD(usdValue);
    if (mode === 'INR') return window.formatINR(usdValue * rate);
    return `${window.formatUSD(usdValue)} / ${window.formatINR(usdValue * rate)}`;
};

// ── Currency toggle buttons ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    fetchRate();
    setInterval(() => fetchRate(true), 60 * 1000);

    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.CurrencyState.mode = btn.dataset.currency;

            // Notify all components to re-render
            document.dispatchEvent(new CustomEvent('currency-changed', {
                detail: { mode: btn.dataset.currency }
            }));
        });
    });
});