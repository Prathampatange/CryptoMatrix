const fetch = require('node-fetch');

const test = async () => {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/^BSESN?interval=1d`;
        const res = await fetch(url);
        const data = await res.json();
        const quote = data.chart.result[0];
        const meta = quote.meta;
        console.log("PRICE:", meta.regularMarketPrice);
        console.log("PREV:", meta.chartPreviousClose);
    } catch (e) {
        console.log("ERR:", e.message);
    }
};

test();
