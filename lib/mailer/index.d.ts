import { EmailSendingOptions } from "./types";
/**
 * Email manager.
 */
export declare class Mailer {
    private constructor();
    private static _instance;
    static get Instance(): Mailer;
    private client;
    /**
     * Init the Email manager.
     */
    init: () => Promise<void>;
    /**
     * Send an email.
     * @param options Email sending options.
     */
    send: (options: EmailSendingOptions) => Promise<void>;
}
declare const _default: Mailer;
export default _default;
