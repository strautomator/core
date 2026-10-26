<template>
    <div>
        <div class="stripe"></div>
        <div class="py-2"></div>

        <v-container class="text-center" fluid>
            <div class="home-wrapper">
                <h1 class="font-weight-light mt-1 mb-2" :class="mdAndUp ? 'text-h4' : 'text-h5'">Strautomator</h1>
                <h2 class="text-h3 font-weight-bold mb-4">Terms and Conditions</h2>

                <v-card color="black" class="mb-2 text-left">
                    <v-card-text>
                        <h4 class="mt-2 mb-6">Policy effective as of October 1st, 2026</h4>
                        <h2 class="mt-2 mb-4">About Strautomator</h2>
                        <p>
                            Please read these Terms of Service ("Terms", "Terms of Service") carefully before using the Strautomator website (the "Service"), available at https://strautomator.com, and operated by Igor Ramadas Leite Nogueira ("us",
                            "we", or "our").
                        </p>
                        <p>
                            The Service is provided on an 'as is' and 'as available' basis. We do not guarantee that the service will be uninterrupted, timely, secure, or error-free. You acknowledge that you use the Service at your own risk and
                            discretion. Your access to and use of the Service is conditioned upon your acceptance of and compliance with these Terms. These Terms apply to all visitors, users and others who wish to access or use the Service. By
                            accessing or using the Service you agree to be bound by these Terms. If you disagree with any part of the terms then you do not have permission to access and use the Service.
                        </p>

                        <h2 class="mt-6 mb-4">Privacy</h2>
                        <p>Your privacy is important to us. It is our policy to respect your privacy and comply with any applicable law and regulation regarding any personal information we may collect about you.</p>

                        <h3 class="mt-6 mb-4">Information we collect</h3>
                        <p>
                            Information we collect includes both information you knowingly and actively provide us when using the Service, and any information automatically sent by your devices in the course of accessing the Service. We only ask for
                            personal information when we truly need it to provide a service to you. We collect it by fair and lawful means, with your knowledge and consent. We also let you know why we're collecting it and how it will be used.
                        </p>

                        <h3 class="mt-1 mb-2">Personal information</h3>
                        <p>We may ask for personal information, or get information provided by third party integrations, which may include one or more of the following:</p>
                        <ul class="mb-6">
                            <li>Social media profile from Strava (required)</li>
                            <li>Email address</li>
                            <li>Addresses used in automations</li>
                            <li>Activity metadata from Strava</li>
                            <li>Activity metadata from Garmin</li>
                            <li>Activity metadata from Wahoo</li>
                            <li>FIT activity files you upload</li>
                            <li>Soundtracks played at Spotify</li>
                            <li>Soundtracks played at Last.fm</li>
                        </ul>

                        <h3 class="mt-1 mb-2">Security of your personal information</h3>
                        <p>
                            When we collect and process personal information, and while we retain this information, we will protect it within commercially acceptable means to prevent loss and theft, as well as unauthorized access, disclosure,
                            copying, use, or modification.
                        </p>
                        <p>
                            Although we will do our best to protect the personal information you provide to us, we advise that no method of electronic transmission or storage is 100% secure, and no one can guarantee absolute data security. We will
                            comply with laws applicable to us in respect of any data breach.
                        </p>
                        <p>You are responsible for ensuring the security of your own information within the bounds of our services.</p>

                        <h3 class="mt-1 mb-2">Storage of your personal information</h3>
                        <p>
                            We keep your personal information only for as long as we need to. This time period may depend on what we are using your information for, in accordance with this policy. If your personal information is no longer required,
                            we will delete it within 30 days. Information stored in the server's access log cannot be removed on-demand, but it will be automatically discarded after around 90 days.
                        </p>

                        <h3 class="mt-6 mb-4">Disclosure of information to third parties</h3>
                        <p>We do not disclose any of your personal information to unauthorized third parties or individuals, except when required by the EU law.</p>
                        <p>If you subscribe to Strautomator PRO, some of your personal details will be exchanged with our Merchant of Record, Paddle.com.</p>
                        <p>
                            If you wish to use AI features, some of your activity metadata will be sent to OpenRouter for processing. OpenRouter routes that request to the provider you select: Anthropic, DeepSeek, Google (Gemini), Mistral, OpenAI,
                            SpaceXAI (Grok) or Z.ai. If OpenRouter cannot complete the request, the same metadata may be sent directly to Google (Gemini). AI insights, available on PRO accounts, can also include recent training context, weather and a
                            custom prompt that you write.
                        </p>

                        <h3 class="mt-6 mb-4">MCP server</h3>
                        <p>
                            PRO accounts can connect third-party AI clients to the Service through our MCP server. Connecting a client is optional. You review a consent screen and authorize the client yourself. After you authorize it, the client can
                            read and change some of the account data you can already access in the Service, including your profile, processed activities, automations and gear, and it can run your automations on an activity. The client receives an
                            access token issued by Strautomator. Your Strava, Garmin, Wahoo and Spotify tokens are not shared with the client. Once the client has the data, that client's own provider may process it under that client's terms, which we
                            do not control. You can revoke a client's access from that client.
                        </p>

                        <h3 class="mt-6 mb-4">Controlling your personal information</h3>
                        <p>You always retain the right to withhold personal information from us, with the understanding that your experience of the Service may be affected.</p>
                        <p>
                            If we receive personal information about you from a third party, we will protect it as set out in this policy. If you believe that any information we hold about you is inaccurate, out of date, incomplete, irrelevant, or
                            misleading, please contact us using the details provided in this policy. We will take reasonable steps to correct any information found to be inaccurate, incomplete, misleading, or out of date.
                        </p>
                        <p>
                            If you believe that we have breached a relevant data protection law and wish to make a complaint, please contact us using the details provided at the footer of this policy and provide us with full details of the alleged
                            breach. We will promptly investigate your complaint and respond to you, setting out the outcome of our investigation and the steps we will take to deal with your complaint.
                        </p>

                        <h4 class="mt-1 mb-2">Feature: "Privacy mode"</h4>
                        <p>
                            You have the option on your account preferences to enable a feature called "Privacy mode". If such feature is enabled, Strautomator will anonymize some of your account details and delete most of the processed data related
                            to your account, including but not limited to:
                        </p>
                        <ul class="mb-6">
                            <li>Your Strava username and location</li>
                            <li>Dates when you changed GearWear components</li>
                            <li>Processed activity dates and sport details</li>
                        </ul>
                        <p>Additionally, some of the Service features will be disabled:</p>
                        <ul class="mb-6">
                            <li>Processing of activity data via external AI providers</li>
                            <li>Tracking of personal activity records</li>
                            <li>History log for GearWear components</li>
                        </ul>
                        <p>
                            Although the "Privacy mode" will decrease our knowledge about your personal and activity data being transmitted to use by Strava, it doesn't fully anonymize your details, and it is still possible to link the information
                            stored by the Service with your account on Strava based on its unique ID.
                        </p>

                        <h2 class="mt-6 mb-4">Subscriptions</h2>
                        <p>
                            Some of our services are available only via a subscription plan named Strautomator PRO (the "Subscription"). New subscriptions are billed as a recurring yearly payment, or bought with a single payment that is valid for the
                            lifetime of the Service. A recurring monthly GitHub sponsorship of at least 1 USD can also be used to get a PRO account. The Subscription might also be acquired via affiliate campaigns. Subscriptions started before
                            September 14th, 2024, and still billed by PayPal, may renew monthly or yearly until they are cancelled.
                        </p>
                        <p>
                            The price of a new Subscription is shown before you pay and varies per country and date. The accepted payment currencies for Paddle and PayPal are CHF, EUR, GBP and USD. GitHub sponsorships are billed in USD. A yearly
                            Subscription renews automatically at the end of each billing cycle, and users are reminded of that renewal on a scheduled basis. A lifetime payment does not need renewals.
                        </p>

                        <h3 class="mt-4 mb-2">Merchant of Record</h3>
                        <p>The online reseller Paddle.com, registered as "Paddle.com Market Ltd.", acts as our Merchant of Record for subscriptions starting from September 14th, 2024.</p>

                        <h3 class="mt-4 mb-2">Payment processing</h3>
                        <p>
                            All new Subscription payments are handled by our Merchant of Record, "Paddle.com Market Ltd.". Users that subscribed prior to September 14th, 2024, are billed by "PayPal (Europe) S.à r.l. et Cie, S.C.A.". Payments for
                            subscriptions made in the form of a Sponsorship via GitHub.com are handled by "Stripe, Inc".
                        </p>
                        <p>
                            We do not collect, process or store credit cards, debit cards, bank details, or other sensitive payment details. All the information related to payment are strictly stored and processed by our payment providers listed
                            above.
                        </p>
                        <p>Questions about payment details should be sent directly to the payment provider, using their contact details that you received via email when the Subscription was made.</p>

                        <h3 class="mt-4 mb-2">Fee changes</h3>
                        <p>
                            At our discretion, we might change the price of the Subscription. Existing subscribers might be affected by the new price, but not before the end of their current billing cycle. We will try, however, to honor existing
                            prices so existing subscriptions are not affected by price changes, whenever possible.
                        </p>
                        <p>
                            Users that have purchased a lifetime subscription are not affected by price changes, and will be able to continue using all the features that were available at the time of the payment for a long as the Service is provided.
                        </p>

                        <h3 class="mt-4 mb-2">Updates to the Subscription</h3>
                        <p>
                            New features and integration with new services are not guaranteed in the future. Features that are currently available to Free accounts, might be removed and restricted to users paying for the Subscription. We do not
                            guarantee that existing features of the Subscription will be available in the future. We do, however, remove features only when strictly necessary, for example due to requests made by Strava, or due to legal reasons.
                        </p>
                        <p>We might release special features that require additional payments in the future.</p>

                        <h3 class="mt-4 mb-2">Cancellation of the Subscription</h3>
                        <p>
                            Users are free to cancel their existing Subscription at any time, through the "Account" page of the Service, or by cancelling the payment for the next billing cycle directly on the payment platform (Paddle.com, PayPal, or
                            GitHub Sponsors). Cancellations are effective immediately, unless stated otherwise during the cancellation process.
                        </p>

                        <h3 class="mt-4 mb-2">Suspension of the Subscription</h3>
                        <p>
                            We reserve the right to suspend and cancel any existing Subscription, if we find that it is not being used in accordance with the Terms and Conditions of the Service, or due to legal reasons and sanctions. This applies to
                            all subscriptions, regardless of their payment date or payment method.
                        </p>

                        <h2 class="mt-6 mb-4">Termination</h2>
                        <p>Users are free to stop using the Service at any time, for any reason, and can request their account to be deleted directly on the "Account" page of the Service.</p>
                        <p>
                            We may terminate or suspend your access to our Service immediately, with prior notice, if you breach the Terms and Conditions or if we are presented with a request from law enforcement. Upon termination, your right to use
                            the Service will immediately cease. If you have an active subscription at the time of termination, it will be cancelled.
                        </p>

                        <h2 class="mt-6 mb-4">Refunds</h2>
                        <p>
                            We do not guarantee refunds for any Subscription payments that have already been made. We do not guarantee refunds for a Subscription made by mistake. We do not issue refunds for subscriptions that were terminated due to
                            breach of the Terms, or due to law enforcement requests. We might, however, give partial refunds, at our discretion, on a per-case basis.
                        </p>
                        <p>It's your responsibility to cancel your Subscription before the next billing cycle, if you decide that you do not want to keep using the Subscription.</p>
                        <p>All refunds are processed by our payment providers directly.</p>

                        <h2 class="mt-6 mb-4">Dependency on Strava</h2>
                        <p>
                            The Service is fully dependent on the Strava API, which is a third party provider. We cannot guarantee that the Strava API will work or exist at any time in the future. If for any reason Strava decides to disable their
                            API, or in the event that our connection to their API is terminated, all of the core features of the Service will cease to work. In such case, yearly subscribers that had their last payment made in the last 30 days are
                            entitled to a refund for that last payment alone. Users with a lifetime subscription are not entitled to a refund.
                        </p>

                        <h2 class="mt-6 mb-4">Limitation of liability</h2>
                        <p>
                            In no event shall Strautomator, nor its developers, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of
                            profits, data, use, goodwill, or other intangible losses, resulting from:
                        </p>
                        <ul class="mb-6">
                            <li>Your access to or use of or inability to access or use the Service</li>
                            <li>Any conduct or content of any third party on the Service</li>
                            <li>Any content obtained from the Service</li>
                            <li>Unauthorized access to data transmitted to or from the Service</li>
                        </ul>

                        <h2 class="mt-6 mb-4">Limits of our Terms</h2>
                        <p>
                            Our website may link to external sites that are not operated by us. Please be aware that we have no control over the content and policies of those sites, and cannot accept responsibility or liability for their respective
                            terms and conditions.
                        </p>

                        <h2 class="mt-6 mb-4">Changes to this policy</h2>
                        <p>
                            At our discretion, we may change our Terms and Conditions to reflect updates to the Service, current acceptable practices, or legislative or regulatory changes. If we decide to change our Terms and Conditions, we will post
                            the changes here at the same link by which you are accessing now. The full history of changes to our Terms and Conditions are available in our public source control repository, at the following address:
                            https://github.com/strautomator/web/blob/master/pages/tc.vue
                        </p>

                        <h2 class="mt-6 mb-4">Contact us</h2>
                        <p>For any questions or concerns, you may contact us on the following email: info@strautomator.com</p>

                        <div class="text-center mt-6">
                            <v-btn color="primary" @click="goBack" rounded>Back {{ backTarget }}</v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
definePageMeta({layout: "landing"})
useHead({title: "Terms and Conditions"})

const store = useMainStore()
const {mdAndUp} = useDisplay()

const backTarget = computed(() => (store.user ? "to the Dashboard" : "home"))

const goBack = () => {
    document.location.href = store.user ? "/dashboard" : "/home"
}
</script>
