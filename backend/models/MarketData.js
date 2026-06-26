const mongoose = require('mongoose');

const marketDataSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, index: true },
        symbol: { type: String, required: true },
        name: { type: String, required: true },
        category: { type: String, default: 'index' },
        currency: { type: String, default: 'USD' },
        flag: { type: String, default: '' },

        // Raw price per base unit (oz for metals, point for indices)
        price: { type: Number, required: true },
        price_usd: { type: Number, default: 0 },
        price_inr: { type: Number, default: 0 },
        usd_inr_rate: { type: Number, default: 83.5 },

        // Standard trading unit (10g gold, 1kg silver, 75-unit Nifty lot, 1-point Sensex)
        unit: { type: Number, default: 1 },
        unit_label: { type: String, default: '' },
        unit_short: { type: String, default: '' },
        unit_note: { type: String, default: '' },
        unit_price_usd: { type: Number, default: 0 },
        unit_price_inr: { type: Number, default: 0 },

        // Day range (raw)
        day_high: { type: Number, default: 0 },
        day_high_usd: { type: Number, default: 0 },
        day_high_inr: { type: Number, default: 0 },
        day_low: { type: Number, default: 0 },
        day_low_usd: { type: Number, default: 0 },
        day_low_inr: { type: Number, default: 0 },

        // Day range (unit-based)
        unit_high_usd: { type: Number, default: 0 },
        unit_high_inr: { type: Number, default: 0 },
        unit_low_usd: { type: Number, default: 0 },
        unit_low_inr: { type: Number, default: 0 },

        prev_close: { type: Number, default: 0 },
        prev_close_inr: { type: Number, default: 0 },
        change: { type: Number, default: 0 },
        change_pct: { type: Number, default: 0 },
        volume: { type: Number, default: 0 },
        market_state: { type: String, default: 'CLOSED' },
        timestamp: { type: Date, default: Date.now },
    },
    { versionKey: false }
);

marketDataSchema.index({ id: 1, timestamp: -1 });
marketDataSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('MarketData', marketDataSchema);