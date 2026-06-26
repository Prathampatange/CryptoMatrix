/**
 * Sentiment tab — renders sentiment data pushed from Socket.io.
 */

let sentimentChart = null;

const initSentimentChart = () => {
    const ctx = document.getElementById('sentimentChart').getContext('2d');
    sentimentChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            animation: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    min: -1, max: 1,
                    grid: { color: 'rgba(48,54,61,0.6)' },
                    ticks: { callback: (v) => v > 0 ? '+' + v : v },
                },
                y: { grid: { display: false } },
            },
        },
    });
};

const renderSentiment = (sentimentMap) => {
    const grid = document.getElementById('sentiment-grid');
    grid.innerHTML = '';

    const coins = Object.entries(sentimentMap);
    if (!coins.length) {
        grid.innerHTML = '<p class="muted">No sentiment data yet.</p>';
        return;
    }

    coins.forEach(([symbol, data]) => {
        const isPos = data.score > 0.1;
        const isNeg = data.score < -0.1;
        const cls = isPos ? 'sent--positive' : isNeg ? 'sent--negative' : 'sent--neutral';
        const pct = Math.min(100, Math.abs(data.score) * 100 + 50); // normalize to bar width

        grid.innerHTML += `
      <div class="sentiment-card ${cls}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${symbol}</strong>
          <span style="font-size:12px;color:var(--muted)">${data.articleCount} articles</span>
        </div>
        <div class="sent-score-bar">
          <div class="sent-score-fill" style="width:${pct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span>${data.label.replace(/_/g, ' ')}</span>
          <span style="font-variant-numeric:tabular-nums">${data.score >= 0 ? '+' : ''}${data.score.toFixed(3)}</span>
        </div>
      </div>
    `;
    });

    // Update bar chart
    if (sentimentChart) {
        const labels = Object.keys(sentimentMap);
        const scores = labels.map((s) => sentimentMap[s].score);
        const colors = scores.map((s) =>
            s > 0.1 ? 'rgba(63,185,80,0.7)' : s < -0.1 ? 'rgba(248,81,73,0.7)' : 'rgba(227,179,65,0.7)'
        );

        sentimentChart.data.labels = labels;
        sentimentChart.data.datasets = [{
            label: 'Sentiment Score',
            data: scores,
            backgroundColor: colors,
            borderRadius: 4,
        }];
        sentimentChart.update();
    }

    // Render top headlines
    renderHeadlines(sentimentMap);
};

const renderHeadlines = (sentimentMap) => {
    const container = document.getElementById('headlines-container');
    container.innerHTML = '';

    Object.entries(sentimentMap).forEach(([symbol, data]) => {
        if (!data.topHeadlines?.length) return;

        const pillClass = (s) =>
            s > 0.1 ? 'score-pill--pos' : s < -0.1 ? 'score-pill--neg' : 'score-pill--neu';

        container.innerHTML += `
      <div class="headlines-section chart-card">
        <h2 class="chart-title">${symbol} — Top Headlines</h2>
        ${data.topHeadlines.map((h) => `
          <div class="headline-item">
            <a href="${h.url}" target="_blank" rel="noopener">${h.title}</a>
            <span class="score-pill ${pillClass(h.score)}">${h.score >= 0 ? '+' : ''}${h.score.toFixed(2)}</span>
          </div>
        `).join('')}
      </div>
    `;
    });
};

document.addEventListener('DOMContentLoaded', initSentimentChart);

// Expose so app.js can call it
window.SentimentUI = { renderSentiment };