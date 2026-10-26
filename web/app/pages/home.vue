<template>
    <div class="site-page hp">
        <section class="hp-hero site-glow">
            <div class="hp-hero-glow"></div>
            <v-container class="hp-hero-container">
                <v-row align="center" justify="center">
                    <v-col cols="12" md="7" class="text-center text-md-left">
                        <div class="site-brand mb-6">
                            <img src="/images/logo.svg" width="28" height="28" class="strautologo" />
                            <span>Strautomator</span>
                        </div>
                        <h1 class="site-headline site-headline-hero">Your Strava,<br /><span class="gradient-text">on autopilot</span></h1>
                        <p class="site-lead">
                            Set the rules once. Strautomator names your rides, tags your commutes, adds the weather, the music and the AI magic, picks the right gear, keeps an eye on your bike parts, and exports your activities and club events to
                            your personal calendar. All of it while you're still catching your breath.
                        </p>
                    </v-col>

                    <v-col cols="12" md="5">
                        <div class="hp-rules">
                            <div class="hp-rules-title"><v-icon size="small" color="primary" start>mdi-lightning-bolt</v-icon>Automations at work</div>
                            <div class="hp-rules-list">
                                <transition name="hp-fade">
                                    <div :key="samplesRound" class="hp-rules-set">
                                        <div v-for="(sample, index) in samples" :key="sample.condition" class="hp-rule" :style="{'--index': index}">
                                            <div><span class="hp-tag">IF</span>{{ sample.condition }}</div>
                                            <div class="mt-1"><span class="hp-tag hp-tag-then">THEN</span>{{ sample.action }}</div>
                                        </div>
                                    </div>
                                </transition>
                            </div>
                        </div>
                    </v-col>
                </v-row>
            </v-container>

            <div class="text-center pt-10"><buttons-connect-strava /></div>
        </section>

        <section class="hp-section hp-section-alt">
            <v-container>
                <h2 class="hp-title">Everything your activities (and gear!) were missing</h2>
                <p class="hp-subtitle">A toolbox for athletes who'd rather train than fiddle with manual updates.</p>

                <v-row class="mt-6">
                    <v-col v-for="feature in features" :key="feature.title" cols="12" sm="6" md="4">
                        <nuxt-link :to="feature.link" class="hp-link">
                            <div class="site-card hp-feature">
                                <div class="hp-icon">
                                    <v-icon size="28" color="primary">{{ feature.icon }}</v-icon>
                                </div>
                                <v-chip v-if="feature.pro" class="hp-pro-chip" color="primary" size="x-small" variant="outlined">PRO</v-chip>
                                <h3>{{ feature.title }}</h3>
                                <p>{{ feature.text }}</p>
                                <span class="hp-more">Learn more <v-icon size="small" color="primary">mdi-arrow-right</v-icon></span>
                            </div>
                        </nuxt-link>
                    </v-col>
                </v-row>
            </v-container>
        </section>

        <section class="hp-section">
            <v-container>
                <v-row v-for="(spot, index) in spotlights" :key="spot.title" class="hp-spot" align="center" :class="{'flex-md-row-reverse': index % 2 == 1}">
                    <v-col cols="12" md="6">
                        <div class="hp-kicker">{{ spot.kicker }}</div>
                        <h2 class="hp-spot-title">{{ spot.title }}</h2>
                        <p class="hp-spot-text">{{ spot.text }}</p>
                        <ul class="hp-checks">
                            <li v-for="point in spot.points" :key="point"><v-icon size="small" color="primary" start>mdi-check-circle</v-icon>{{ point }}</li>
                        </ul>
                        <v-btn :to="spot.link" color="primary" variant="outlined" rounded>
                            Explore
                            <v-icon end>mdi-arrow-right</v-icon>
                        </v-btn>
                    </v-col>
                    <v-col cols="12" md="6" class="text-center">
                        <img class="site-shot" :src="spot.image" :alt="spot.title" />
                    </v-col>
                </v-row>
            </v-container>
        </section>

        <section class="hp-section hp-section-alt">
            <v-container>
                <h2 class="hp-title">See it in action</h2>

                <div class="hp-phones mt-8">
                    <div v-for="n in 5" :key="n" class="hp-phone">
                        <img :src="`/images/screenshot-${n}.jpg`" :alt="`Strautomator screenshot ${n}`" loading="lazy" />
                    </div>
                </div>
            </v-container>
        </section>

        <section id="pricing" class="hp-section">
            <v-container>
                <h2 class="hp-title">Start free. Go PRO when you're hooked.</h2>
                <p class="hp-subtitle">PRO costs less than an espresso per month.</p>

                <v-row class="mt-6" justify="center">
                    <v-col cols="12" sm="6" md="4">
                        <div class="site-card hp-plan">
                            <div class="hp-plan-name">FREE</div>
                            <div class="hp-plan-price">{{ currencySymbol }}0</div>
                            <div class="hp-plan-note">forever</div>
                            <ul class="hp-checks">
                                <li><v-icon size="small" start>mdi-check</v-icon>{{ freePlanDetails.maxRecipes }} automations</li>
                                <li><v-icon size="small" start>mdi-check</v-icon>{{ freePlanDetails.maxGearWear }} GearWear configurations</li>
                                <li><v-icon size="small" start>mdi-check</v-icon>Single weather provider</li>
                                <li><v-icon size="small" start>mdi-check</v-icon>Limited AI features</li>
                                <li><v-icon size="small" start>mdi-check</v-icon>Calendar export ({{ freePlanDetails.pastCalendarDays }} to {{ freePlanDetails.futureCalendarDays }} days)</li>
                                <li><v-icon size="small" start>mdi-check</v-icon>Personal records for bike and run</li>
                            </ul>
                        </div>
                    </v-col>
                    <v-col cols="12" sm="6" md="4">
                        <div class="site-card hp-plan hp-plan-pro">
                            <div class="hp-plan-badge">All the features</div>
                            <div class="hp-plan-name">PRO</div>
                            <div class="hp-plan-price">{{ currencySymbol }}{{ yearlyPrice }} / year</div>
                            <div class="hp-plan-note">or {{ currencySymbol }}{{ lifetimePrice }} once for lifetime access</div>
                            <ul class="hp-checks">
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Unlimited automations and GearWear</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Shared automations</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Multiple weather providers</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Extended AI features, multiple AI providers</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Extended calendar export</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Personal records for all sports</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Garmin and Wahoo sensors and battery tracking</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Spotify lyrics and track list</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>Automatic FTP estimation and update</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>MCP server</li>
                                <li><v-icon size="small" start color="primary">mdi-check-all</v-icon>No ads, no backlinks</li>
                            </ul>
                        </div>
                    </v-col>
                </v-row>
            </v-container>
        </section>

        <section class="hp-strip">
            <v-container>
                <div class="hp-strip-title">Plays nicely with the services you already use</div>
                <div class="hp-strip-items">
                    <img v-for="logo in logos" :key="logo.name" :src="logo.src" :alt="logo.name" :title="logo.name" :height="logo.height" />
                </div>
            </v-container>
        </section>

        <section class="hp-section">
            <v-container class="hp-narrow">
                <div class="site-card hp-oss">
                    <v-icon size="56" color="primary" class="hp-oss-icon">mdi-github</v-icon>
                    <div class="hp-oss-body">
                        <div class="hp-kicker">Free to download</div>
                        <h2 class="hp-spot-title">Open source software</h2>
                        <p class="hp-spot-text">
                            Strautomator is fully open source, licensed under the AGPL-3.0. Everyone is welcome to view, edit and contribute. And if you are well versed in tech, you can self-host your own instance of the service! PRO features, for
                            free.
                        </p>
                        <v-btn href="https://github.com/strautomator" target="github" color="primary" variant="outlined" rounded>
                            <v-icon start>mdi-github</v-icon>
                            View on GitHub
                        </v-btn>
                    </div>
                </div>
            </v-container>
        </section>

        <section class="site-cta">
            <v-container class="text-center">
                <h2 class="site-headline site-headline-cta">Turbocharge <span class="gradient-text">your Strava experience</span></h2>
                <p class="site-lead mx-auto">Connect your Strava account today!</p>
                <div class="mt-6"><buttons-connect-strava /></div>
            </v-container>
        </section>

        <v-snackbar v-model="showCookieConsent" color="accent" class="text-caption" :timeout="600000" min-height="68" location="bottom">
            This website is using cookies!
            <template #actions>
                <v-btn @click="acceptCookies" title="Alright, sir!">Accept</v-btn>
            </template>
        </v-snackbar>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

interface SampleRule {
    condition: string
    action: string
}

interface HomeFeature {
    icon: string
    title: string
    text: string
    link: string
    pro?: boolean
}

const allSamples = [
    {condition: "ride starts at home and ends at the office", action: "mark it as commute and set bike to 'Cityrad'"},
    {condition: "avg. power is higher than 300 watts", action: "name the activity 'Suffer test'"},
    {condition: "activity starts before 6AM", action: "name it 'Early bird'"},
    {condition: "temperature is under 0°C", action: "name it 'Frosty commute' and add the weather"},
    {condition: "sport type is ride or gravel ride", action: "generate a unique activity name using AI"},
    {condition: "sport type is run or hike", action: "write the activity description using AI"},
    {condition: "virtual ride using Zwift", action: "add my Spotify playlist to the description"},
    {condition: "bike chain reaches 4000km", action: "alert me to swap it via email"},
    {condition: "ride passes on my favourite bakery", action: "name it 'Cake ride #' with an auto-incrementing counter"},
    {condition: "no hard efforts during the past weeks", action: "update my FTP on Strava"},
    {condition: "short ride recorded with a Garmin Edge", action: "mark as commute and mute it from the feed"},
    {condition: "wind speed higher than 20 m/s", action: "set the description to 'Windy as hell'"}
]

const allFeatures = [
    {icon: "mdi-robot-happy-outline", title: "AI activity names and descriptions", text: 'Say goodbye to "Morning Ride". Get unique and funny names and descriptions, generated with AI.', link: "/feature/ai"},
    {icon: "mdi-brain", title: "Private AI insights", text: "Personalized analysis and suggestions about your workouts, visible only to you.", link: "/feature/ai-insights", pro: true},
    {icon: "mdi-weather-partly-rainy", title: "Weather on your activities", text: "Temperature, wind, humidity and more weather conditions added to names and descriptions.", link: "/feature/weather"},
    {icon: "mdi-bike-fast", title: "Commutes and other tags", text: "Tag your activities as commute, race or workout according to your automation rules.", link: "/feature/commute"},
    {icon: "mdi-wrench-clock", title: "GearWear", text: "Track kilometers and hours on shoes, chains, tires and other bike components, and get alerted before they get worn out.", link: "/feature/gearwear"},
    {icon: "mdi-battery-charging-80", title: "Battery tracker", text: "Never get caught by a dead sensor: track the battery level of your Garmin and Wahoo devices.", link: "/feature/battery-tracker", pro: true},
    {icon: "mdi-spotify", title: "Spotify & Last.fm", text: "Add the tracks, or even the lyrics, that were playing during your workouts.", link: "/feature/spotify"},
    {icon: "mdi-heart-flash", title: "FTP auto update", text: "Estimate your FTP from your recent efforts and keeps it up to date on Strava.", link: "/feature/ftp", pro: true},
    {icon: "mdi-calendar-export", title: "Calendar export", text: "Your past activities and upcoming club events, in the calendar app of your choice.", link: "/feature/calendar"},
    {icon: "mdi-map-marker-radius", title: "Upcoming events map", text: "Upcoming club events shown on a map, with weather forecasts and traffic overlays.", link: "/feature/upcoming-events-map"},
    {icon: "mdi-trophy-outline", title: "Personal records", text: "Keep track of your best efforts across sports, and celebrate every new PR.", link: "/feature/records"},
    {icon: "mdi-counter", title: "Activity counter", text: 'Auto-incrementing numbers for your names: "Cake Ride #12", "Hill repeats #47", "11907KM this year"...', link: "/feature/counter"},
    {icon: "mdi-eye-off-outline", title: "Auto-mute", text: "Keep the trainer sessions and short commutes out of your followers' feed.", link: "/feature/mute"},
    {icon: "mdi-map-outline", title: "Map styles", text: "Choose the default map style for your activities, based on the sport.", link: "/feature/mapstyles"},
    {icon: "mdi-connection", title: "MCP access", text: "Connect Cursor, Claude and other agents to your account, and manage everything by chatting.", link: "/feature/mcp", pro: true}
]

const logos = [
    {name: "Garmin", src: "/images/integrations/garmin.png", height: 22},
    {name: "Wahoo", src: "/images/integrations/wahoo.png", height: 36},
    {name: "Spotify", src: "/images/integrations/spotify.png", height: 36},
    {name: "Last.fm", src: "/images/integrations/lastfm.svg", height: 30},
    {name: "OpenAI", src: "/images/integrations/openai.svg", height: 30},
    {name: "Claude", src: "/images/integrations/anthropic.svg", height: 30},
    {name: "Gemini", src: "/images/integrations/gemini.svg", height: 30},
    {name: "Mistral", src: "/images/integrations/mistral.svg", height: 30},
    {name: "DeepSeek", src: "/images/integrations/deepseek.svg", height: 30}
]

const spotlights = [
    {
        kicker: "AI powered",
        title: "Activities with a personality",
        text: "Let AI turn every workout into something worth reading. Fun, unique names and descriptions, plus private insights about your training that only you can see.",
        points: ["Choose the tone: from serious coach to sarcastic friend", "Insights based on your real activity data", "Works for any activity type"],
        link: "/feature/ai",
        image: "/images/feature/action-auto-generate.png"
    },
    {
        kicker: "GearWear",
        title: "Know your gear before it fails",
        text: "Stop guessing when the chain is worn out or the shoes have seen enough. Strautomator counts every kilometer and hour and alerts you at the right time.",
        points: ["Automatically assigns the right gear and components to each activity", "Bikes, shoes and every single component", "Alerts by email as the limits get close"],
        link: "/feature/gearwear",
        image: "/images/feature/gearwear-list.png"
    },
    {
        kicker: "Battery tracker",
        title: "Sensors that never die on you",
        text: "Keep an eye on the batteries of your power meter, shifters and heart rate straps, using the data of your Garmin and Wahoo devices.",
        points: ["Garmin and Wahoo support", "Know exactly when a battery is running low", "One place for all of your devices"],
        link: "/feature/battery-tracker",
        image: "/images/feature/battery-tracking.png"
    }
]

definePageMeta({layout: "landing"})
useHead({title: "Your Strava, on autopilot"})

const store = useMainStore()
const {currencySymbol} = useSubscription()
const cookieConsent = useCookie<boolean>("cookie-consent", {path: "/", maxAge: 60 * 60 * 24 * 365 * 10})

const showCookieConsent = ref(!cookieConsent.value)
const samples = useState<SampleRule[]>("home-samples", () => _.sampleSize(allSamples, 4))
const features = useState<HomeFeature[]>("home-features", () => _.shuffle(allFeatures))
const samplesRound = ref(0)
const timerSamples = ref<ReturnType<typeof setInterval> | null>(null)

const freePlanDetails = computed(() => store.freePlanDetails || {})
const proPlanDetails = computed(() => store.proPlanDetails || {})
const yearlyPrice = computed(() => proPlanDetails.value?.price?.yearly?.toFixed(2) || "-")
const lifetimePrice = computed(() => proPlanDetails.value?.price?.lifetime?.toFixed(2) || "-")

/**
 * Accept the cookie consent banner.
 */
const acceptCookies = () => {
    try {
        cookieConsent.value = true
        showCookieConsent.value = false
    } catch (ex) {}
}

onMounted(() => {
    timerSamples.value = setInterval(() => {
        samples.value = _.sampleSize(allSamples, 4)
        samplesRound.value++
    }, 6000)
})

onBeforeUnmount(() => {
    if (timerSamples.value) {
        clearInterval(timerSamples.value)
    }
})
</script>

<style scoped>
.hp {
    overflow-x: hidden;
}

.hp section {
    position: relative;
}

.hp-hero {
    padding: 64px 0 72px 0;
}

.hp-hero-container {
    max-width: 1140px;
}

.hp-rules {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    box-shadow: 0 20px 60px -20px rgba(252, 76, 2, 0.35);
    min-height: 380px;
    padding: 20px;
    text-align: left;
}

.hp-rules-title {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.8rem;
    letter-spacing: 1.5px;
    margin-bottom: 12px;
    text-transform: uppercase;
}

.hp-rule {
    background: rgba(0, 0, 0, 0.45);
    border-left: 3px solid #ffa000;
    border-radius: 10px;
    font-size: 0.95rem;
    margin-bottom: 10px;
    padding: 12px 14px;
}

.hp-tag {
    background: rgba(255, 160, 0, 0.18);
    border-radius: 4px;
    color: #ffb300;
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 1px;
    margin-right: 8px;
    padding: 1px 6px;
}

.hp-tag-then {
    background: rgba(252, 76, 2, 0.2);
    color: #ff7043;
}

/* Old and new sets share the same grid cell, so they cross-fade in place without overflowing the panel. */
.hp-rules-list {
    display: grid;
}

.hp-rules-set {
    grid-area: 1 / 1;
}

.hp-fade-enter-active {
    transition: opacity 0.9s ease 0.3s;
}

.hp-fade-leave-active {
    transition: opacity 0.4s ease;
}

.hp-fade-enter-from,
.hp-fade-leave-to {
    opacity: 0;
}

.hp-fade-enter-active .hp-rule {
    transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
    transition-delay: calc(0.3s + var(--index) * 90ms);
}

.hp-fade-enter-from .hp-rule {
    transform: translateY(14px);
}

.hp-fade-leave-active .hp-rule {
    transition: transform 0.4s ease;
}

.hp-fade-leave-to .hp-rule {
    transform: translateY(-8px);
}

.hp-strip {
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding: 22px 0;
}

.hp-strip-title {
    color: rgba(255, 255, 255, 0.45);
    font-size: 0.75rem;
    letter-spacing: 2px;
    margin-bottom: 14px;
    text-align: center;
    text-transform: uppercase;
}

.hp-strip-items {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 20px 48px;
    justify-content: center;
}

.hp-strip-items img {
    opacity: 0.6;
    transition: opacity 200ms;
}

.hp-strip-items img:hover {
    opacity: 1;
}

.hp-section {
    padding: 44px 0;
}

.hp-section-alt {
    background: #101013;
}

.hp-narrow {
    max-width: 800px;
}

.hp-title {
    font-size: 2.4rem;
    font-weight: 700;
    letter-spacing: -0.5px;
    text-align: center;
}

.hp-subtitle {
    color: rgba(255, 255, 255, 0.65);
    font-size: 1.1rem;
    margin: 10px auto 0 auto;
    max-width: 640px;
    text-align: center;
}

.hp-feature p {
    color: rgba(255, 255, 255, 0.65);
    margin-bottom: 0;
}

.hp-link {
    color: inherit !important;
    display: block;
    height: 100%;
}

.hp-feature h3 {
    font-size: 1.1rem;
    margin-bottom: 6px;
}

.hp-feature:hover {
    border-color: rgba(255, 160, 0, 0.6);
    box-shadow: 0 10px 40px -15px rgba(255, 160, 0, 0.5);
    transform: translateY(-4px);
}

.hp-icon {
    align-items: center;
    background: rgba(255, 160, 0, 0.12);
    border-radius: 12px;
    display: inline-flex;
    height: 52px;
    justify-content: center;
    margin-bottom: 14px;
    width: 52px;
}

.hp-pro-chip {
    position: absolute;
    right: 20px;
    top: 22px;
}

.hp-more {
    color: #ffa000;
    display: inline-block;
    font-size: 0.85rem;
    margin-top: 12px;
}

.hp-spot {
    margin-bottom: 48px;
    margin-top: 48px;
}

.hp-kicker {
    color: #ff7043;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 2px;
    margin-bottom: 8px;
    text-transform: uppercase;
}

.hp-spot-title {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1.15;
    margin-bottom: 14px;
}

.hp-spot-text {
    color: rgba(255, 255, 255, 0.7);
    font-size: 1.05rem;
    line-height: 1.6;
}

.hp-checks {
    list-style: none;
    margin-bottom: 22px;
    padding-left: 0;
}

.hp-checks li {
    margin-bottom: 8px;
}

.hp-phones {
    display: flex;
    gap: 28px;
    overflow-x: auto;
    padding: 10px 20px 30px 20px;
    scroll-snap-type: x mandatory;
}

.hp-phone {
    background: #000000;
    border: 6px solid #2a2a2e;
    border-radius: 32px;
    box-shadow: 0 25px 50px -20px rgba(0, 0, 0, 0.9);
    flex: 0 0 auto;
    overflow: hidden;
    scroll-snap-align: center;
    width: 250px;
}

.hp-phone:first-child {
    margin-left: auto;
}

.hp-phone:last-child {
    margin-right: auto;
}

.hp-phone img {
    display: block;
    width: 100%;
}

.hp-plan {
    display: flex;
    flex-direction: column;
    padding: 32px;
}

.hp-plan-pro {
    background: linear-gradient(160deg, rgba(255, 160, 0, 0.14) 0%, rgba(252, 76, 2, 0.1) 100%);
    border-color: #ffa000;
    box-shadow: 0 20px 60px -25px rgba(255, 160, 0, 0.6);
}

.hp-plan-badge {
    background: linear-gradient(90deg, #ffa000, #fc4c02);
    border-radius: 20px;
    color: #000000;
    font-size: 0.7rem;
    font-weight: 700;
    left: 50%;
    letter-spacing: 1px;
    padding: 3px 14px;
    position: absolute;
    text-transform: uppercase;
    top: -12px;
    transform: translateX(-50%);
}

.hp-plan-name {
    color: rgba(255, 255, 255, 0.6);
    font-weight: 700;
    letter-spacing: 3px;
}

.hp-plan-price {
    font-size: 3rem;
    font-weight: 800;
    line-height: 1.2;
}

.hp-plan-note {
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.85rem;
    margin-bottom: 20px;
}

.hp-plan .hp-checks {
    flex-grow: 1;
}

.hp-oss {
    align-items: center;
    display: flex;
    gap: 28px;
    padding: 36px;
}

.hp-oss-icon {
    flex: 0 0 auto;
}

.hp-oss .hp-spot-text {
    margin-bottom: 20px;
}

@media (max-width: 959px) {
    .hp-hero {
        padding-top: 40px;
    }

    .hp-rules {
        min-height: 0;
    }

    .hp-oss {
        flex-direction: column;
        padding: 28px;
        text-align: center;
    }

    .hp-title {
        font-size: 1.9rem;
    }

    .hp-section {
        padding: 26px 0;
    }
}
</style>
