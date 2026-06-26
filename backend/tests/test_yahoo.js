const fs = require('fs');
const yahooFinance = require('yahoo-finance2').default;

const test = async () => {
    try {
        const quote = await yahooFinance.quote('^BSESN');
        console.log("SUCCESS:", quote.regularMarketPrice);
    } catch (e) {
        fs.writeFileSync('err_out.txt', e.stack || e.message);
    }
};

test();
