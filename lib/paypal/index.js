"use strict";
// Strautomator Core: PayPal
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * PayPal API handler.
 */
class PayPal {
    constructor() { }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
}
exports.PayPal = PayPal;
// Exports...
exports.default = PayPal.Instance;
