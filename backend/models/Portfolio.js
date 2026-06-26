const mongoose = require('mongoose');

/**
 * Portfolio schema — stores a user's crypto holdings.
 * For simplicity we use a single "default" user (no auth).
 * Extend with userId for multi-user support.
 */
const holdingSchema = new mongoose.Schema({
    symbol: { type: String, required: true, uppercase: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    avg_buy_price: { type: Number, required: true, min: 0 }, // cost basis per coin
    added_at: { type: Date, default: Date.now },
}, { _id: true });

const portfolioSchema = new mongoose.Schema({
    user_id: { type: String, default: 'default' },
    holdings: [holdingSchema],
    updated_at: { type: Date, default: Date.now },
}, { versionKey: false });

// Pre-save: update timestamp
portfolioSchema.pre('save', function () {
    this.updated_at = new Date();
});

module.exports = mongoose.model('Portfolio', portfolioSchema);