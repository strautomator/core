<template>
    <div>
        <v-container fluid>
            <h1>{{ migrated ? "Migration finished" : "Migration to Paddle" }}</h1>

            <div v-if="!user.isPro">
                <v-card variant="outlined">
                    <v-card-text>
                        <h3 class="mb-2">You don't have an active PRO subscription.</h3>
                        <div>The migration from PayPal to Paddle.com is available for current subscribers only.</div>
                        <div class="mt-4 text-center text-md-left">
                            <v-btn color="primary" to="/account" title="Back to my account" exact variant="outlined" rounded size="small">
                                <v-icon start>mdi-arrow-left</v-icon>
                                Back to My Account
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </div>

            <div v-else>
                <template v-if="loading">
                    <v-progress-circular size="32" width="2" v-if="loading" indeterminate></v-progress-circular>
                    <span class="ml-4">Fetching subscription details...</span>
                </template>
                <template v-else-if="subscription?.source != 'paypal'">
                    <p>Your current PRO subscription was not paid via PayPal, so you don't need to migrate.</p>
                    <v-btn color="primary" to="/account" title="Back to my account" exact size="small" rounded variant="outlined">
                        <v-icon start>mdi-arrow-left</v-icon>
                        Back to My Account
                    </v-btn>
                </template>

                <div v-else-if="migrated">
                    <p class="mt-4 mb-6">The migration process from PayPal to Paddle has finished! Please check your email for the confirmation invoice.</p>
                    <p>
                        Future payments will now be handled exclusively via Paddle.
                        <span v-if="refundAmount">We have issued a refund of {{ refundAmount }} on your previous PayPal subscription.</span>
                    </p>

                    <p v-if="errorMessage">{{ errorMessage }}</p>
                    <div class="mt-4 text-center text-md-left">
                        <v-btn color="primary" to="/account" title="Back to my account" exact size="small" rounded variant="outlined">
                            <v-icon start>mdi-arrow-left</v-icon>
                            Back to My Account
                        </v-btn>
                    </div>
                </div>

                <div v-else>
                    <p class="mt-4 mb-6">We welcome all users who have subscribed using PayPal to migrate their PRO subscriptions to <a href="https://paddle.com/about" title="Paddle.com" target="paddle">Paddle.com</a>.</p>
                    <h4 class="mb-1 text-md-h6">Why is Strautomator switching to Paddle?</h4>
                    <p>Paddle is a well established billing platform that supports more payment methods compared to PayPal. Additionally, it acts as a Merchant of Record for Strautomator, taking care of all our billing and payment related tasks.</p>

                    <h4 class="mb-1 text-md-h6">Do I need to migrate?</h4>
                    <p>No, the PRO subscription migration from PayPal to Paddle is optional.</p>

                    <h4 class="mb-1 text-md-h6">What is the migration process?</h4>
                    <p>First, you'll need to proceed and subscribe again using the new Paddle checkout process. Once the new subscription is activated, your previous PayPal subscription will be automatically cancelled.</p>
                    <p>For this migration you'll have the option to keep doing yearly payments, or switch to a lifetime subscription. A partial refund will be issued to your PayPal account in case you decide to stay on the yearly payments option.</p>
                    <v-alert class="bg-accent" v-if="discountLifetime || discountYearly" variant="outlined">
                        As a "thank you" we are offering a discount to a limited number of users that migrate from PayPal to Paddle.
                        <br />
                        Use code <strong class="text-primary">{{ discountLifetime || "PAYPAL10M" }}</strong> for the lifetime subscription or <strong class="text-primary">{{ discountYearly || "PAYPAL10M" }}</strong> for the yearly subscription at
                        checkout.
                    </v-alert>

                    <v-card variant="outlined">
                        <v-card-text>
                            <p>
                                To start the migration, please select your desired subscription frequency below.<br />
                                The relevant discount codes, if any, will be applied automatically at checkout.
                            </p>

                            <div class="pt-2 text-center text-md-left">
                                <v-btn color="primary" title="Subscribe via Paddle" @click="paddleCheckout(false)" class="mb-4 mb-md-0 mr-md-2" rounded>
                                    <v-icon start>mdi-database-import-outline</v-icon>
                                    Yearly subscription
                                </v-btn>
                                <v-btn color="primary" title="Subscribe via Paddle" @click="paddleCheckout(true)" rounded>
                                    <v-icon start>mdi-database-import-outline</v-icon>
                                    Lifetime subscription
                                </v-btn>
                            </div>
                        </v-card-text>
                    </v-card>
                </div>
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
declare global {
    interface Window {
        Paddle?: any
        paddleHasLoaded?: boolean
    }
}

useHead({title: "Migration to Paddle"})

const store = useMainStore()
const route = useRoute()
const api = useApi()
const webError = useWebError()
const {user} = useUser()

const loading = ref(true)
const subscription = ref<any>(null)
const paddleTransactionId = ref<string>(null)
const migrated = ref(false)
const discountLifetime = ref<string>(null)
const discountYearly = ref<string>(null)
const errorMessage = ref<string>(null)
const lifetime = ref<boolean>(null)
const refundAmount = ref<any>(0)

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
 * Load the user's current subscription.
 */
const loadSubscription = async () => {
    try {
        if (user.value.isPro) {
            loading.value = true
            const data = await api(`/api/users/${user.value.id}/subscription`)
            loading.value = false
            subscription.value = data
        }
    } catch (ex) {
        webError("PaddleMigration.fetch", ex)
    }

    loading.value = false
}

/**
 * Open a Paddle checkout for the chosen migration frequency.
 */
const paddleCheckout = async (isLifetime: boolean) => {
    lifetime.value = isLifetime

    try {
        await initializePaddle()
        const priceId = isLifetime ? store.paddle.priceId.lifetime : store.paddle.priceId.yearly
        const checkout: any = {
            settings: {
                allowLogout: false,
                showAddDiscounts: true,
                displayMode: "overlay",
                theme: "dark"
            }
        }

        checkout.customData = {userId: user.value.id, paypalMigration: subscription.value.id}
        checkout.items = [{quantity: 1, priceId: priceId}]

        if (isLifetime && discountLifetime.value) {
            checkout.discountCode = discountLifetime.value
        } else if (discountYearly.value) {
            checkout.discountCode = discountYearly.value
        }

        if (user.value.paddleId) {
            checkout.customer = {id: user.value.paddleId}
        } else if (user.value.email) {
            checkout.customer = {email: user.value.email}
        }

        window.Paddle.Checkout.open(checkout)
    } catch (ex: any) {
        window.Paddle?.Checkout?.close()
        ex.title = "Could not start the checkout process"
        webError("PaddleMigration.paddleCheckout", ex)
    }
}

/**
 * Handle Paddle checkout lifecycle events for migration.
 */
const paddleCallback = async (ev: any) => {
    try {
        if (ev.name == "checkout.customer.created" && ev.data?.customer?.id) {
            await api(`/api/paddle/${user.value.id}/customer?migration=1`, {method: "POST", body: {id: ev.data.customer.id, email: ev.data.customer.email, transactionId: ev.data.transaction_id}})
            store.setUserData({paddleId: ev.data.customer.id, paddleTransactionId: ev.data.transaction_id})
            paddleTransactionId.value = ev.data.transaction_id
        } else if (ev.name == "checkout.completed") {
            store.setUserData({paddleTransactionId: null})
            await cancelPayPal()
            migrated.value = true
            window.Paddle.Checkout.close()
        }
    } catch (ex) {
        errorMessage.value = "If you need any support, please contact us via email at info@strautomator.com."
    }
}

/**
 * Cancel the old PayPal subscription after Paddle checkout completes.
 */
const cancelPayPal = async () => {
    try {
        window.Paddle.Spinner.show()
        const res: any = await api(`/api/paypal/${user.value.id}/paddlemigration`, {method: "POST", body: {paddleTransactionId: paddleTransactionId.value, lifetime: lifetime.value}})
        refundAmount.value = parseFloat(res.refundAmount || 0) ? res.refundAmount : null
    } catch (ex) {
        errorMessage.value = "We have requested the cancellation of your PayPal subscription, and it should be processed in the next 24 hours."
    }

    window.Paddle.Spinner.hide()
}

onMounted(() => {
    loadSubscription()
    initializePaddle().catch((ex) => webError("PaddleMigration.initializePaddle", ex))
    if (route.query.dl) {
        discountLifetime.value = route.query.dl as string
    }
    if (route.query.dy) {
        discountYearly.value = route.query.dy as string
    }
})
</script>
