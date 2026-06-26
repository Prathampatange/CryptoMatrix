/**
 * frontend/js/portfolio.js
 * Portfolio tracker — full dual currency + unit measures per asset.
 */

let allocationChart = null;

const COIN_NAMES = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'Binance Coin',
  SENSEX: 'BSE Sensex', NIFTY: 'Nifty 50', GOLD: 'Gold', SILVER: 'Silver',
};

// ── Asset quantity units ──────────────────────────────────
const ASSET_UNITS = {
  BTC: { label: 'coins', placeholder: 'e.g. 0.05 coins' },
  ETH: { label: 'coins', placeholder: 'e.g. 1.5 coins' },
  SOL: { label: 'coins', placeholder: 'e.g. 10 coins' },
  BNB: { label: 'coins', placeholder: 'e.g. 5 coins' },
  SENSEX: { label: 'units', placeholder: 'e.g. 1 unit' },
  NIFTY: { label: 'units', placeholder: 'e.g. 1 unit' },
  GOLD: { label: 'grams', placeholder: 'e.g. 10 grams' },
  SILVER: { label: 'grams', placeholder: 'e.g. 100 grams' },
};

// ── Buy price currency state ──────────────────────────────
let buyPriceCurrency = 'USD'; // 'USD' or 'INR'

// ── Formatters ─────────────────────────────────────────────
const usd = (v) => window.formatUSD ? window.formatUSD(v) : '$' + parseFloat(v).toFixed(2);
const inr = (v) => window.formatINR ? window.formatINR(v) : '₹' + parseFloat(v).toFixed(2);

const dualCell = (usdVal, inrVal) => {
  const mode = window.CurrencyState?.mode || 'BOTH';
  if (mode === 'USD') return usd(usdVal);
  if (mode === 'INR') return inr(inrVal);
  return `${usd(usdVal)}<br><span style="font-size:11px;color:var(--cyan);font-family:var(--font-mono)">${inr(inrVal)}</span>`;
};

const pct = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

// ── Load ───────────────────────────────────────────────────
const loadPortfolio = async () => {
  try {
    const res = await fetch('/api/portfolio');
    const data = await res.json();
    if (data.success) renderPortfolio(data.data);
  } catch (err) {
    console.error('Portfolio load error:', err);
  }
};

// ── Render ─────────────────────────────────────────────────
const renderPortfolio = ({ holdings, summary }) => {
  const mode = window.CurrencyState?.mode || 'BOTH';

  // Summary stats
  const valEl = document.getElementById('pf-total-value');
  const cstEl = document.getElementById('pf-total-cost');
  const pnlEl = document.getElementById('pf-total-pnl');
  const pctEl = document.getElementById('pf-total-pct');

  if (mode === 'USD') {
    if (valEl) valEl.textContent = usd(summary.total_value_usd);
    if (cstEl) cstEl.textContent = usd(summary.total_cost_usd);
    if (pnlEl) pnlEl.textContent = usd(summary.total_pnl_usd);
  } else if (mode === 'INR') {
    if (valEl) valEl.textContent = inr(summary.total_value_inr);
    if (cstEl) cstEl.textContent = inr(summary.total_cost_inr);
    if (pnlEl) pnlEl.textContent = inr(summary.total_pnl_inr);
  } else {
    if (valEl) valEl.innerHTML = `${usd(summary.total_value_usd)}<br><span style="font-size:14px;color:var(--cyan)">${inr(summary.total_value_inr)}</span>`;
    if (cstEl) cstEl.innerHTML = `${usd(summary.total_cost_usd)}<br><span style="font-size:14px;color:var(--text3)">${inr(summary.total_cost_inr)}</span>`;
    if (pnlEl) pnlEl.innerHTML = `${usd(summary.total_pnl_usd)}<br><span style="font-size:14px">${inr(summary.total_pnl_inr)}</span>`;
  }

  if (pnlEl) pnlEl.className = `pf-value ${summary.total_pnl_usd >= 0 ? 'pnl--pos' : 'pnl--neg'}`;
  if (pctEl) {
    pctEl.textContent = pct(summary.total_pnl_pct);
    pctEl.className = `pf-value ${summary.total_pnl_pct >= 0 ? 'pnl--pos' : 'pnl--neg'}`;
  }

  // Rate display
  const rateEl = document.getElementById('pf-rate-display');
  if (rateEl) rateEl.textContent = `1 USD = ₹${(summary.usd_inr_rate || 83.5).toFixed(2)}`;

  // Holdings table
  const wrapper = document.getElementById('holdings-table-wrapper');
  if (!wrapper) return;

  if (!holdings.length) {
    wrapper.innerHTML = '<div class="empty-state">No holdings yet. Add one above.</div>';
  } else {
    wrapper.innerHTML = `
      <div class="table-scroll">
        <table class="holdings-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Quantity</th>
              <th>Avg Buy</th>
              <th>Current Price</th>
              <th>Value</th>
              <th>P&amp;L</th>
              <th>Return</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${holdings.map(h => {
              const unitInfo = ASSET_UNITS[h.symbol] || { label: 'units' };
              return `
              <tr>
                <td>
                  <div style="display:flex;flex-direction:column;gap:2px">
                    <span style="color:var(--cyan);font-weight:700;font-family:var(--font-mono)">${h.symbol}</span>
                    <span style="color:var(--text3);font-size:10px">${h.name}</span>
                  </div>
                </td>
                <td style="font-family:var(--font-mono)">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span>${h.quantity}</span>
                    <span style="font-size:10px;color:var(--cyan);background:var(--cyan-dim);padding:1px 6px;border-radius:3px;border:1px solid rgba(0,245,196,0.2);font-weight:700;text-transform:uppercase;letter-spacing:0.4px">${unitInfo.label}</span>
                  </div>
                </td>
                <td style="font-family:var(--font-mono)">
                  ${dualCell(h.avg_buy_price_usd, h.avg_buy_price_inr)}
                </td>
                <td style="font-family:var(--font-mono)">
                  ${dualCell(h.current_price_usd, h.current_price_inr)}
                </td>
                <td style="font-family:var(--font-mono)">
                  ${dualCell(h.current_value_usd, h.current_value_inr)}
                </td>
                <td class="${h.pnl_usd >= 0 ? 'pnl--pos' : 'pnl--neg'}" style="font-family:var(--font-mono)">
                  ${dualCell(h.pnl_usd, h.pnl_inr)}
                </td>
                <td class="${h.pnl_pct >= 0 ? 'pnl--pos' : 'pnl--neg'}" style="font-family:var(--font-mono);font-weight:700">
                  ${pct(h.pnl_pct)}
                </td>
                <td>
                  <button class="delete-btn" onclick="removeHolding('${h._id}')">✕ Remove</button>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Allocation chart
  if (allocationChart && holdings.length) {
    allocationChart.data.labels = holdings.map(h => h.symbol);
    allocationChart.data.datasets = [{
      data: holdings.map(h => h.current_value_usd),
      backgroundColor: ['#00f5c4', '#4facfe', '#f5a623', '#a78bfa', '#ff4d6d', '#10d488', '#ffd27d', '#94a3b8'],
      borderWidth: 0,
      hoverOffset: 8,
    }];
    allocationChart.update();
  }
};

// ── Add holding ────────────────────────────────────────────
const addHolding = async () => {
  const symbol = document.getElementById('pf-symbol')?.value;
  const qty = parseFloat(document.getElementById('pf-qty')?.value);
  const rawPrice = parseFloat(document.getElementById('pf-buy-price')?.value);

  if (!qty || !rawPrice || qty <= 0 || rawPrice <= 0) {
    showFormError('Please enter a valid quantity and buy price.'); return;
  }

  // Convert to USD if user entered INR
  const rate = window.CurrencyState?.usdInrRate || 83.5;
  const buyPriceUSD = buyPriceCurrency === 'INR' ? rawPrice / rate : rawPrice;

  const btn = document.getElementById('pf-add-btn');
  if (btn) { btn.innerHTML = '<span>Adding…</span>'; btn.disabled = true; }

  try {
    const res = await fetch('/api/portfolio/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        name: COIN_NAMES[symbol] || symbol,
        quantity: qty,
        avg_buy_price: buyPriceUSD,
      }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('pf-qty').value = '';
      document.getElementById('pf-buy-price').value = '';
      loadPortfolio();
    }
  } catch (err) {
    console.error('Add error:', err);
  } finally {
    if (btn) { btn.innerHTML = '<span>+ Add</span>'; btn.disabled = false; }
  }
};

// ── Remove holding ─────────────────────────────────────────
window.removeHolding = async (id) => {
  if (!confirm('Remove this holding?')) return;
  try {
    await fetch(`/api/portfolio/holdings/${id}`, { method: 'DELETE' });
    loadPortfolio();
  } catch (err) {
    console.error('Delete error:', err);
  }
};

// ── Form error ─────────────────────────────────────────────
const showFormError = (msg) => {
  let el = document.getElementById('pf-form-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pf-form-error';
    el.style.cssText = 'color:var(--red);font-size:12px;font-family:var(--font-mono);margin-top:8px;width:100%';
    document.querySelector('.add-holding-form')?.after(el);
  }
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 3000);
};

// ── Update form hints on asset change ─────────────────────
const updateFormHints = (symbol) => {
  const unitInfo = ASSET_UNITS[symbol] || { label: 'units', placeholder: 'e.g. 1 unit' };

  const qtyInput = document.getElementById('pf-qty');
  const unitBadge = document.getElementById('pf-unit-badge');
  const priceInput = document.getElementById('pf-buy-price');

  if (qtyInput) qtyInput.placeholder = unitInfo.placeholder;
  if (unitBadge) unitBadge.textContent = unitInfo.label;
  if (priceInput) {
    priceInput.placeholder = `Avg buy price (${buyPriceCurrency})`;
  }
};

// ── Update buy price currency toggle ──────────────────────
const updateBuyPriceCurrency = (currency) => {
  buyPriceCurrency = currency;
  document.querySelectorAll('.pf-cur-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.priceCurrency === currency);
  });
  const symbol = document.getElementById('pf-symbol')?.value || 'BTC';
  const priceInput = document.getElementById('pf-buy-price');
  if (priceInput) priceInput.placeholder = `Avg buy price (${currency})`;
};

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const ctx = document.getElementById('allocationChart')?.getContext('2d');
  if (ctx) {
    allocationChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        animation: { duration: 600 },
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, padding: 16, color: '#4a5568', font: { size: 10, family: "'Space Mono', monospace" } },
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
                const rate = window.CurrencyState?.usdInrRate || 83.5;
                const inrV = c.raw * rate;
                const p = ((c.raw / c.chart.data.datasets[0].data.reduce((a, b) => a + b, 0)) * 100).toFixed(1);
                return ` ${c.label}: ${window.formatUSD(c.raw)} / ${window.formatINR(inrV)} (${p}%)`;
              },
            },
          },
        },
      },
    });
  }

  document.getElementById('pf-add-btn')?.addEventListener('click', addHolding);

  // Asset dropdown changes → update unit hints
  const symbolSelect = document.getElementById('pf-symbol');
  if (symbolSelect) {
    symbolSelect.addEventListener('change', () => updateFormHints(symbolSelect.value));
    updateFormHints(symbolSelect.value); // init
  }

  // Buy price currency toggle
  document.querySelectorAll('.pf-cur-btn').forEach(btn => {
    btn.addEventListener('click', () => updateBuyPriceCurrency(btn.dataset.priceCurrency));
  });

  // Re-render on currency change
  document.addEventListener('currency-changed', loadPortfolio);
  document.addEventListener('rate-updated', loadPortfolio);
  document.addEventListener('rerender-portfolio', loadPortfolio);

  loadPortfolio();
});

window.Portfolio = { reload: loadPortfolio };