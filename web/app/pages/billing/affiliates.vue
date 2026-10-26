<template>
    <div>
        <v-container fluid>
            <h1>1 year of PRO</h1>
            <v-alert border="top" border-color="accent" class="pb-0" v-if="user.isPro && !['github', 'paypal'].includes(subscriptionSource)">
                <p>You have a PRO account already! But of course I won't mind if you keep it active and still use the links below.</p>
            </v-alert>

            <p>
                Yes! Want to try Strautomator's PRO features, but not really convinced you should spend money on a subscription yet? You can get the first year for free, by using a referral code to register to one of our affiliated fintech services.
                These are services that I personally use on a daily basis. Here's how it works:
            </p>
            <ul class="ml-n2">
                <li>Register using our referral link</li>
                <li>Complete the described steps</li>
                <li>Send me your Strava ID via <a href="mailto:info@strautomator.com" title="Email">email</a></li>
            </ul>
            <p class="mt-4">Once you have completed the registration and everything is confirmed, your account will be switched to PRO.</p>
            <p>After 1 year, if you still wish to keep using PRO features, you'll need to purchase an yearly or the lifetime subscription.</p>

            <v-card v-if="revolut" class="mt-5" variant="outlined">
                <v-card-title class="bg-accent text-center text-md-left">
                    <a href="https://links.strautomator.com/l/revolut" title="Go to Revolut" target="revolut"><img src="https://links.strautomator.com/images/revolut.png" alt="Revolut" class="mx-auto mx-md-0 card-affiliate-logo color-invert" /></a>
                </v-card-title>
                <v-card-text>
                    <div class="mt-3 mb-1">
                        <p>Revolut is an online bank with more than 65 million customers worldwide. It has all the features and financial services that you could possibly imagine, from transfers to stocks to crypto to travel eSIM.</p>
                        <ul class="ml-n2">
                            <li>Open your Revolut account with our link</li>
                            <li>Add money to your new account</li>
                            <li>Request a physical Revolut card</li>
                            <li>Make at least 3 purchases of 5+ EUR</li>
                            <li>Steps must be completed within 10 days</li>
                        </ul>
                        <div class="mt-5 text-center text-md-left">
                            <a href="https://links.strautomator.com/l/revolut" title="Go to Revolut" target="revolut"><v-btn color="primary" rounded>Go to Revolut</v-btn></a>
                        </div>
                    </div>
                </v-card-text>
            </v-card>

            <v-card v-if="tradeRepublic" class="mt-5" variant="outlined">
                <v-card-title class="bg-accent text-center text-md-left">
                    <a href="https://links.strautomator.com/l/traderepublic" title="Go to Trade Republic" target="tr"><img src="https://links.strautomator.com/images/traderepublic.png" class="mx-auto mx-md-0 card-affiliate-logo color-invert" /></a>
                </v-card-title>
                <v-card-text>
                    <div class="mt-3 mb-1">
                        <p>Trade Republic is an online broker with more than 10 million customers in the EU. Commission-free trading for 1 EUR only, and up to 4% interest and 1% cashback using their VISA card.</p>
                        <ul class="ml-n2">
                            <li>Open your account with our link</li>
                            <li>Trade at least 100+ EUR</li>
                            <li>Steps must be completed within 21 days</li>
                        </ul>
                        <div class="mt-5 text-center text-md-left">
                            <a href="https://links.strautomator.com/l/traderepublic" title="Go to Trade Republic" target="traderepublic"><v-btn color="primary" rounded>Go to Trade Republic</v-btn></a>
                        </div>
                    </div>
                </v-card-text>
            </v-card>

            <v-card v-if="amex" class="mt-5" variant="outlined">
                <v-card-title class="bg-accent text-center text-md-left">
                    <a href="https://links.strautomator.com/l/amex" title="Go to American Express" target="amex"><img src="https://links.strautomator.com/images/amex.png" class="mx-auto mx-md-0 card-affiliate-logo" /></a>
                </v-card-title>
                <v-card-text>
                    <div class="mt-3 mb-1">
                        <p>
                            American Express has partnered with PAYBACK to offer cashback and additional discounts in selected stores. The card has no annual fees, and gives you a minimum of 1 point for every 3 EUR spent, plus a signup bonus of up to
                            4000 points.
                        </p>
                        <ul class="ml-n2">
                            <li>Apply for an Amex card with our link</li>
                            <li>Make at least 1 transaction with the card</li>
                            <li>Steps must be completed within 21 days</li>
                        </ul>
                        <div class="mt-5 text-center text-md-left">
                            <a href="https://links.strautomator.com/l/amex" title="Go to American Express" target="amex"><v-btn color="primary" rounded>Go to American Express</v-btn></a>
                        </div>
                    </div>
                </v-card-text>
            </v-card>

            <v-alert border="top" color="accent" class="mt-5">
                Please note that you <strong>must</strong> use the buttons above to open the correct referral links. If you register to any of these fintech services separately by going directly to their website, they will not be able to match the
                referral code.
            </v-alert>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Subscription via affiliates"})

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {user} = useUser()
const {getSubscriptionSource} = useSubscription()

const country = store.country
const revolut = ref(true)
const tradeRepublic = ref(["AT", "BE", "DE", "ES", "FR", "IT", "PT"].includes(country))
const amex = ref(["DE"].includes(country))
const subscriptionSource = ref("...")

/**
 * Load subscription details to show the existing PRO source.
 */
const loadSubscription = async () => {
    try {
        if (user.value.isPro) {
            const subscription = await api(`/api/users/${user.value.id}/subscription`)
            subscriptionSource.value = getSubscriptionSource(subscription)
        }
    } catch (ex) {
        webError("Billing.fetch", ex)
    }
}

onMounted(loadSubscription)
</script>
