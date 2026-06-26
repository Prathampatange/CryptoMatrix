const io = require("socket.io-client");
const socket = io("http://localhost:3000");

socket.on('connect', () => {
    console.log("Connected");
});

socket.on('market_update', (data) => {
    console.log("RECEIVED MARKET UPDATE:", Object.keys(data));
    if (data.markets) {
        console.log("Markets count:", data.markets.length);
        console.log("Sample market ID:", data.markets[0]?.id);
    }
    process.exit(0);
});

setTimeout(() => {
    console.log("Timeout waiting for market_update");
    process.exit(0);
}, 5000);
