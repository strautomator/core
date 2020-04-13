/**
 * A PayPal transaction.
 */
export interface PayPalTransaction {
    id: string;
    amount: number;
    date: Date;
}
