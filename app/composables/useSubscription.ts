// Strautomator Web: Subscription helpers

/**
 * Currency details and subscription helpers.
 */
export const useSubscription = () => {
    const store = useMainStore()
    const currency = store.expectedCurrency
    const symbols: Record<string, string> = {CHF: "₣", EUR: "€", GBP: "£", USD: "$"}
    const sources: Record<string, string> = {
        friend: "Friend",
        github: "GitHub",
        paddle: "Paddle",
        paypal: "PayPal",
        revolut: "Revolut",
        amex: "American Express",
        traderepublic: "Trade Republic"
    }

    /**
     * Get the friendly name of the subscription source.
     * @param subscription The subscription.
     */
    const getSubscriptionSource = (subscription: any): string => {
        if (!subscription) return "?"
        return sources[subscription.source] || "?"
    }

    return {currency, currencySymbol: symbols[currency], getSubscriptionSource}
}
