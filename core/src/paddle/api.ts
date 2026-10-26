// Strautomator Core: Paddle API

import paddleSdk from "@paddle/paddle-node-sdk"

/**
 * Paddle API handler.
 */
export class PaddleAPI {
    private constructor() {}
    private static _instance: PaddleAPI
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Paddle SDK.
     */
    client: paddleSdk.Paddle
}

// Exports...
export default PaddleAPI.Instance
