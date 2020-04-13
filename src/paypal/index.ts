// Strautomator Core: PayPal

/**
 * PayPal API handler.
 */
export class PayPal {
    private constructor() {}
    private static _instance: PayPal
    static get Instance() {
        return this._instance || (this._instance = new this())
    }
}

// Exports...
export default PayPal.Instance
