/**
 * backend/models/Price.js
 * Schema for crypto price ticks — stores both USD and INR.
 */

const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema(
    {
        symbol: { type: String, required: true, uppercase: true, index: true },
        name: { type: String, required: true },
        price_usd: { type: Number, required: true },
        price_inr: { type: Number, default: 0 },
        usd_inr_rate: { type: Number, default: 83.5 },
        market_cap: { type: Number, default: 0 },
        market_cap_inr: { type: Number, default: 0 },
        volume_24h: { type: Number, default: 0 },
        volume_24h_inr: { type: Number, default: 0 },
        price_change_24h: { type: Number, default: 0 },
        price_change_pct_24h: { type: Number, default: 0 },
        timestamp: { type: Date, default: Date.now },
    },
    { versionKey: false }
);

priceSchema.index({ symbol: 1, timestamp: -1 });
priceSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('Price', priceSchema);