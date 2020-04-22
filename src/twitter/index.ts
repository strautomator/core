// Strautomator Core: Twitter

/**
 * Twitter wrapper.
 */
export class Twitter {
    private constructor() {}
    private static _instance: Twitter
    static get Instance() {
        return this._instance || (this._instance = new this())
    }
}

// Exports...
export default Twitter.Instance
