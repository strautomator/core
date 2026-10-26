<template>
    <div>
        <v-container fluid>
            <div v-if="unsubscribed" class="mt-4 mb-8 text-center text-h2 font-weight-black"><v-icon size="x-large">mdi-emoticon-sad</v-icon></div>
            <h1 v-else>{{ user.isPro ? "My PRO subscription" : "Get PRO" }}</h1>
            <p>Hi {{ user.profile.firstName }}!</p>

            <template v-if="unsubscribed">
                <v-card variant="outlined">
                    <v-card-text>
                        <h3 class="mb-2">Your account will switch from PRO back to Free soon!</h3>
                        <div>
                            {{ unsubMessage }}
                        </div>
                        <div>Thanks for your support, and remember that you can always resubscribe if you wish to have all the bells and whistles again.</div>
                    </v-card-text>
                </v-card>
                <div class="mt-4 text-center text-md-left">
                    <v-btn color="primary" to="/account" title="Back to my account" exact variant="outlined" rounded size="small">
                        <v-icon start>mdi-arrow-left</v-icon>
                        Back to My Account
                    </v-btn>
                </div>
            </template>

            <template v-else-if="user.isPro">
                <template v-if="loading">
                    <v-progress-circular size="32" width="2" v-if="loading" indeterminate></v-progress-circular>
                    <span class="ml-4">Fetching subscription details...</span>
                </template>
                <p v-else-if="subscription?.status != 'CANCELLED'">Thank you for subscribing and becoming a <strong>PRO</strong>! Your support is truly appreciated <v-icon size="small">mdi-emoticon-outline</v-icon></p>
                <p v-else>Your account will be switched from <strong>PRO</strong> to <strong>Free</strong> in a few moments.</p>

                <v-card variant="outlined">
                    <v-card-text>
                        <template v-if="unsubscribed">
                            <h3 class="text-error mb-2">Your subscription was cancelled!</h3>
                            <div>Your account will be downgraded back to the free version.</div>
                            <div class="text-center mt-8 mb-6">
                                <v-icon size="x-large">mdi-emoticon-sad</v-icon>
                            </div>
                        </template>
                        <template v-else-if="subscription">
                            <div>Subscription method: {{ subscriptionSource }}</div>
                            <div class="mb-2">Price: {{ paymentAmount }}</div>
                            <div v-if="user.isTrial">Trial period</div>
                            <div v-else-if="subscriptionSource != 'Friend'">Last payment: {{ lastPaymentDetails }}</div>
                            <div>{{ nextPaymentDetails }}</div>

                            <div class="mt-4" v-if="subscription.source == 'paypal'">
                                <div>Hint: migrate your subscription to our new payment provider, Paddle!</div>
                            </div>

                            <div class="mt-6 text-center text-md-left" v-if="['paddle', 'paypal'].includes(subscription.source) && subscription.frequency != 'lifetime'">
                                <v-btn class="mr-md-2" color="primary" title="Migrate to Paddle" to="/billing/paddlemigration" v-if="subscription.source == 'paypal'" rounded>
                                    <v-icon start>mdi-database-import-outline</v-icon>
                                    Migrate subscription
                                </v-btn>
                                <v-btn class="mt-4 mt-md-0 mr-md-2" color="primary" title="View subscription at Paddle" v-if="subscription.source == 'paddle'" @click.stop="paddleManage" rounded>
                                    <v-icon start>{{ subscription.status == "CANCELLED" ? "mdi-refresh" : "mdi-credit-card-outline" }}</v-icon>
                                    {{ subscription.status == "CANCELLED" ? "Reactivate subscription" : "Manage subscription" }}
                                </v-btn>
                                <v-btn class="mt-4 mt-md-0" color="removal" title="Unsubscribe" v-if="subscription.status != 'CANCELLED'" @click.stop="showUnsubDialog" rounded>
                                    <v-icon start>mdi-cancel</v-icon>
                                    Cancel subscription
                                </v-btn>
                            </div>
                        </template>

                        <template v-else-if="!loading">
                            <h3 class="text-secondary ma-0 mb-2">Oops!</h3>
                            Seems like your subscription is missing some details on our end.
                            <br v-if="mdAndUp" />
                            Don't worry, your PRO account is safe and the issue should magically disappear in a few days.
                        </template>
                    </v-card-text>
                </v-card>

                <div class="mt-4 text-center text-md-left">
                    <v-btn color="primary" to="/account" title="Back to my account" exact variant="outlined" rounded size="small">
                        <v-icon start>mdi-arrow-left</v-icon>
                        Back to My Account
                    </v-btn>
                </div>

                <v-dialog v-model="unsubDialog" width="440" opacity="0.95">
                    <v-card>
                        <v-toolbar color="removal">
                            <v-toolbar-title>Cancel subscription</v-toolbar-title>
                            <v-spacer></v-spacer>
                            <v-toolbar-items>
                                <v-btn icon="mdi-close" @click.stop="hideUnsubDialog"></v-btn>
                            </v-toolbar-items>
                        </v-toolbar>
                        <v-card-text>
                            <p class="mt-3">Thanks for your support! If you don't mind, please let me know why're you're cancelling your PRO subscription (optional).</p>
                            <div>
                                <v-textarea label="I'm cancelling it because..." v-model="unsubReason" maxlength="200" rounded variant="outlined" no-resize></v-textarea>
                            </div>
                            <div class="text-center text-md-right">
                                <v-spacer></v-spacer>
                                <v-btn class="mb-4 mb-md-0 mr-md-2" color="grey" title="I want to keep PRO" @click.stop="hideUnsubDialog" variant="text" rounded>
                                    <v-icon start>mdi-check</v-icon>
                                    Keep it
                                </v-btn>
                                <v-btn color="removal" title="Confirm and unsubscribe" @click="unsubscribe" rounded>
                                    <v-icon start>mdi-cancel</v-icon>
                                    Cancel subscription
                                </v-btn>
                            </div>
                        </v-card-text>
                    </v-card>
                </v-dialog>
            </template>

            <template v-else>
                <p class="mt-4 mb-6">Our payment processor (Paddle.com) supports all major credit cards, as well as PayPal, Google Pay and Apple Pay.</p>

                <v-card class="mb-6" variant="outlined">
                    <v-card-title class="bg-accent">Subscription options</v-card-title>
                    <v-card-text class="pt-4">
                        <ul class="ml-n2 mb-6">
                            <li>A single "set and forget" payment of {{ currencySymbol }}{{ store.proPlanDetails.price.lifetime.toFixed(2) }}.</li>
                            <li>A recurring yearly payment of {{ currencySymbol }}{{ store.proPlanDetails.price.yearly.toFixed(2) }}.</li>
                            <li>A recurring monthly GitHub sponsorship of $1.00+.</li>
                            <li v-if="discount">
                                Limited offer: try the code <span class="font-weight-bold">{{ discount }}</span> for extra savings on the lifetime or yearly subscriptions!
                            </li>
                        </ul>

                        <v-row>
                            <v-col md="4" sm="12">
                                <v-btn
                                    :class="route.query.frequency == 'lifetime' ? 'pulse-button' : ''"
                                    color="primary"
                                    title="Lifetime subscription via Paddle"
                                    @click="paddleCheckout('lifetime')"
                                    :size="mdAndUp ? 'x-large' : undefined"
                                    block
                                    rounded
                                >
                                    <v-icon start>mdi-credit-card-outline</v-icon>
                                    {{ store.proPlanDetails.price.lifetime.toFixed(2) }} {{ currency }} / lifetime
                                </v-btn>
                            </v-col>
                            <v-col md="4" sm="12">
                                <v-btn :class="route.query.frequency == 'yearly' ? 'pulse-button' : ''" color="primary" title="Yearly subscription via Paddle" @click="paddleCheckout('yearly')" :size="mdAndUp ? 'x-large' : undefined" block rounded>
                                    <v-icon start>mdi-credit-card-outline</v-icon>
                                    {{ store.proPlanDetails.price.yearly.toFixed(2) }} {{ currency }} / year
                                </v-btn>
                            </v-col>
                            <v-col md="4" sm="12">
                                <a href="https://github.com/sponsors/igoramadas" title="Sponsor me on GitHub!">
                                    <v-btn color="primary" title="Sponsorship via GitHub" :size="mdAndUp ? 'x-large' : undefined" block rounded>
                                        <v-icon start>mdi-github</v-icon>
                                        Sponsorship
                                    </v-btn>
                                </a>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>

                <free-pro-table />
            </template>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs"

declare global {
    interface Window {
        Paddle?: any
        paddleHasLoaded?: boolean
    }
}

useHead({title: "Billing"})

const store = useMainStore()
const route = useRoute()
const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()
const {currency, currencySymbol, getSubscriptionSource} = useSubscription()

const loading = ref(true)
const subscription = ref<any>(null)
const subscriptionSource = ref<string>(null)
const unsubscribed = ref(false)
const unsubDialog = ref(false)
const unsubReason = ref("")
const unsubMessage = ref<string>(null)
const discount = ref<string>(null)

const isAffiliate = computed(() => ["Amex", "Friend", "Revolut", "Trade Republic"].includes(subscriptionSource.value))
const paymentAmount = computed(() => {
    if (!subscription.value || isAffiliate.value) return "free"
    return subscription.value.price + " " + subscription.value.currency
})
const lastPaymentDetails = computed(() => {
    if (!subscription.value) return ""
    if (isAffiliate.value) return "never"
    if (["GitHub"].includes(subscriptionSource.value)) return "managed via GitHub"
    return subscription.value.dateLastPayment ? dayjs(subscription.value.dateLastPayment).format("ll") : `managed via ${subscriptionSource.value}`
})
const nextPaymentDetails = computed(() => {
    if (!subscription.value) return ""
    if (subscription.value.status == "CANCELLED") return `Cancelled at: ${dayjs(subscription.value.dateUpdated)}`
    if (subscription.value.frequency == "lifetime") return `LIFETIME SUBSCRIPTION`
    if (subscription.value.dateExpiry) return `Expires at: ${dayjs(subscription.value.dateExpiry).format("ll")}`
    if (subscription.value.dateNextPayment) return `Next payment: ${dayjs(subscription.value.dateNextPayment).format("ll")}`
    if (subscription.value.status == "ACTIVE" && subscription.value.dateLastPayment) return `Next payment: around ${dayjs(subscription.value.dateLastPayment).add(1, "year").format("ll")}`
    return "No future payments are scheduled."
})

/**
 * Load the Paddle script if Nuxt has not loaded it already.
 */
const loadPaddleScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (window.Paddle) {
            resolve()
            return
        }

        const existing = document.querySelector<HTMLScriptElement>('script[src="https://cdn.paddle.com/paddle/v2/paddle.js"]')
        if (existing) {
            existing.addEventListener("load", () => resolve(), {once: true})
            existing.addEventListener("error", reject, {once: true})
            return
        }

        const script = document.createElement("script")
        script.src = "https://cdn.paddle.com/paddle/v2/paddle.js"
        script.crossOrigin = "anonymous"
        script.onload = () => resolve()
        script.onerror = reject
        document.head.appendChild(script)
    })
}

/**
 * Initialize the Paddle checkout SDK once.
 */
const initializePaddle = async () => {
    await loadPaddleScript()
    if (!window.paddleHasLoaded) {
        window.Paddle.Initialize({token: store.paddle.token, eventCallback: paddleCallback})
        if (store.paddle.environment == "sandbox") {
            window.Paddle.Environment.set("sandbox")
        }
        window.paddleHasLoaded = true
    }
}

/**
 * Load the current PRO subscription details.
 */
const loadSubscription = async () => {
    try {
        if (user.value.isPro) {
            loading.value = true
            const data = await api(`/api/users/${user.value.id}/subscription`)
            loading.value = false

            subscription.value = data
            subscriptionSource.value = getSubscriptionSource(data)
        }
    } catch (ex) {
        webError("Billing.fetch", ex)
    }

    loading.value = false
}

/**
 * Create a transaction for managing an existing Paddle subscription.
 */
const paddleManage = async () => {
    try {
        const transaction: any = await api(`/api/paddle/${user.value.id}/new-transaction`)
        if (transaction?.newCheckout) {
            await paddleCheckout()
            return
        }
        store.setUserData({paddleTransactionId: transaction.id})
        await paddleCheckout("update", transaction.id)
    } catch (ex: any) {
        ex.title = "Could not create a transaction with Paddle"
        webError("Billing.paddleManage", ex)
    }
}

/**
 * Open the Paddle checkout for a new or existing transaction.
 */
const paddleCheckout = async (action?: string, transactionId?: string) => {
    try {
        await initializePaddle()
        const priceId = action == "lifetime" ? store.paddle.priceId.lifetime : store.paddle.priceId.yearly
        const checkout: any = {
            settings: {
                allowLogout: false,
                showAddDiscounts: true,
                successUrl: `${window.location.protocol}//${window.location.host}/billing/success`,
                displayMode: "overlay",
                theme: "dark"
            }
        }
        if (transactionId && action != "lifetime") {
            checkout.transactionId = transactionId
        } else {
            checkout.customData = {userId: user.value.id}
            checkout.items = [{quantity: 1, priceId: priceId}]
            if (user.value.paddleId) {
                checkout.customer = {id: user.value.paddleId}
            } else if (user.value.email) {
                checkout.customer = {email: user.value.email}
            }
        }
        if (discount.value) {
            checkout.discountCode = discount.value
        }

        window.Paddle.Checkout.open(checkout)
    } catch (ex: any) {
        ex.title = "Could not start the checkout process"
        webError("Billing.paddleCheckout", ex)
    }
}

/**
 * Handle Paddle checkout lifecycle events.
 */
const paddleCallback = async (ev: any) => {
    try {
        if (ev.name == "checkout.customer.created" && ev.data?.customer?.id) {
            await api(`/api/paddle/${user.value.id}/customer`, {method: "POST", body: {id: ev.data.customer.id, email: ev.data.customer.email, transactionId: ev.data.transaction_id}})
            store.setUserData({paddleId: ev.data.customer.id})
        } else if (ev.name == "checkout.completed") {
            store.setUserData({paddleTransactionId: null})
        }
    } catch (ex) {
        console.error("Billing.paddleCheckout", ex)
        window.Paddle.Checkout.close()
    }
}

/**
 * Cancel the current subscription.
 */
const unsubscribe = async () => {
    try {
        loading.value = true

        if (unsubReason.value) unsubReason.value = unsubReason.value.trim()

        const res: any = await api(`/api/users/${user.value.id}/unsubscribe`, {method: "POST", body: {reason: unsubReason.value || null}})
        unsubMessage.value = res.message
        loading.value = false
        unsubscribed.value = true
        store.setUserData({isPro: false, subscriptionId: null})
    } catch (ex: any) {
        ex.title = "Error trying to unsubscribe your account"
        webError("Billing.unsubscribe", ex)
    }

    loading.value = false
    unsubDialog.value = false
}

const showUnsubDialog = () => (unsubDialog.value = true)
const hideUnsubDialog = () => (unsubDialog.value = false)

onMounted(() => {
    loadSubscription()
    initializePaddle().catch((ex) => webError("Billing.initializePaddle", ex))
    discount.value = (route.query.discount as string) || null
})
</script>
