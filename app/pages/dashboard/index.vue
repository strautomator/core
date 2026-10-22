<template>
    <div>
        <v-container fluid>
            <h1 class="mb-4">
                Hi {{ user && !user.preferences.privacyMode && user.profile.firstName.length < 13 ? user.profile.firstName : "there" }}!
                <v-btn class="float-right mt-3 text-h6 font-weight-bold" color="primary" to="/dashboard/charts" title="View charts" size="32" icon><v-icon size="small">mdi-poll</v-icon></v-btn>
            </h1>
            <v-alert v-if="stravaStatus" color="error" border="top" class="mb-4">
                <div class="font-weight-bold">Strava status: {{ stravaStatus }}</div>
                <div>
                    Please note that some of the automations might fail to run, and some features might not work reliably during this incident. For more information please check
                    <a class="text-secondary" href="https://status.strava.com" title="Strava API status" target="strava">status.strava.com.</a>
                </div>
            </v-alert>
            <v-alert v-else-if="lastAnnouncement" v-model="alertAnnouncement" color="accent" border="top" class="mb-4" closable>
                <v-icon v-if="lastAnnouncement.newFeature" class="float-left mr-1">mdi-new-box</v-icon>
                <v-icon v-else-if="lastAnnouncement.affiliate" class="float-left mr-1">mdi-cart</v-icon>
                <div class="font-weight-bold mb-1">
                    {{ lastAnnouncement.title }}
                </div>
                <div>
                    {{ lastAnnouncement.body }}
                    <br v-if="!mdAndUp" />
                    <a v-if="lastAnnouncement.affiliate" target="strautoaffiliate" :title="lastAnnouncement.title" :href="lastAnnouncement.href" @click="readAnnouncement()">Open affiliate link...</a>
                    <a v-else-if="lastAnnouncement.href?.substring(0, 4) == 'http'" :title="lastAnnouncement.title" :href="lastAnnouncement.href" @click="readAnnouncement()">Open...</a>
                    <nuxt-link v-else-if="lastAnnouncement.href" :title="lastAnnouncement.title" :to="lastAnnouncement.href" @click="readAnnouncement()">More...</nuxt-link>
                </div>
            </v-alert>
            <div v-if="!user.isPro">
                Want to get the most out of Strautomator? Consider
                <nuxt-link to="/billing" title="Strautomator PRO">upgrading to PRO</nuxt-link>
                for only {{ currencySymbol }}{{ store.proPlanDetails.price.yearly.toFixed(2) }}
                to unlock all the features!
            </div>
            <div class="mb-4">
                See something new? Check the
                <nuxt-link to="/changelog" title="Strautomator updates">changelog</nuxt-link>
                to keep track of new features and bug fixes.
            </div>

            <div v-if="!recipes || recipes.length == 0">
                <recipes-create-first />
            </div>
            <div v-else>
                <v-card variant="outlined">
                    <v-card-title class="bg-accent">Last automated activities</v-card-title>
                    <v-card-text class="pl-0 pr-0">
                        <div class="mt-4 pl-4 pr-4" v-if="!activities">
                            <div class="mb-4">
                                <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                                Loading recent activities...
                            </div>
                        </div>
                        <div class="mt-4 pl-4 pr-4" v-else-if="activities.length == 0">
                            <p>
                                <v-icon color="secondary" class="mr-1">mdi-alert-circle-outline</v-icon>
                                None of your activities were processed by Strautomator yet.
                            </p>
                            <p>
                                Maybe you want to double check your
                                <nuxt-link to="/automations" title="Automations">automations</nuxt-link>?
                            </p>
                        </div>

                        <processed-activities :activities="activities" v-else></processed-activities>

                        <div class="ml-md-4 mt-4 text-center text-md-left">
                            <v-btn color="primary" title="Go to my automations history" to="/automations/history" size="small" rounded>
                                <v-icon start>mdi-history</v-icon>
                                Automation history
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </div>

            <v-card v-if="!user?.preferences.privacyMode" class="mt-4" variant="outlined">
                <v-card-title class="bg-accent">Personal records</v-card-title>
                <v-card-text class="pl-0 pr-0">
                    <template v-if="records">
                        <v-table :class="{'mt-2': !mdAndUp}">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th class="text-center" v-for="recordField in visibleRecordFields" :title="recordField" :key="'th-' + recordField">
                                        <v-icon>{{ getRecordIcon(recordField) }}</v-icon>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="recordEntry in records" :key="recordEntry[0]">
                                    <td class="text-center">
                                        <v-icon>{{ getSportIcon(recordEntry[0]) }}</v-icon>
                                    </td>
                                    <td class="text-center" v-for="recordField in visibleRecordFields" :key="'td-' + recordField">
                                        {{ recordEntry[1][recordField] ? getRecordValue(recordEntry[1], recordField) : "-" }}
                                    </td>
                                </tr>
                            </tbody>
                        </v-table>
                        <v-divider />
                        <div class="ml-md-4 mt-4 text-center text-md-left">
                            <v-btn color="primary" title="Go to my personal records" to="/dashboard/records" size="small" rounded>
                                <v-icon start>mdi-medal</v-icon>
                                My personal records
                            </v-btn>
                        </div>
                    </template>
                    <template v-else>
                        <div class="ml-md-4 mt-4 text-center text-md-left">No personal records found. Want to start tracking?</div>
                        <div class="ml-md-4 mt-4 text-center text-md-left">
                            <v-btn color="primary" title="Calculate my personal records" to="/dashboard/records" size="small" rounded>
                                <v-icon start>mdi-medal</v-icon>
                                Start tracking my records
                            </v-btn>
                        </div>
                    </template>
                </v-card-text>
            </v-card>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

useHead({title: "Dashboard"})

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()
const {stravaStatus, getStravaStatus, getRecordIcon, getSportIcon} = useStrava()
const {currencySymbol} = useSubscription()

const activities = ref<any[]>(null)
const announcements = ref<any[]>(null)
const lastAnnouncement = ref<any>(null)
const alertAnnouncement = ref(false)

const recipes = computed(() => Object.values(user.value.recipes))

const records = computed(() => {
    const athleteRecords = store.athleteRecords
    return athleteRecords ? _.sortBy(Object.entries(athleteRecords), (r) => r[0].replace("Virtual", "")) : null
})

const visibleRecordFields = computed(() => {
    if (mdAndUp.value) {
        return ["distance", "movingTime", "elevationGain", "wattsMax", "hrMax", "calories"]
    }
    return ["distance", "elevationGain", "wattsMax", "hrMax"]
})

watch(alertAnnouncement, (newVal, oldVal) => {
    if (oldVal && !newVal) {
        readAnnouncement()
    }
})

/**
 * Get the formatted value of the passed record field.
 */
const getRecordValue = (recordDetails: any, field: string) => {
    let result = field.includes("Time") ? (recordDetails[field].value / 3600).toFixed(1) : recordDetails[field].value

    // On mobile we do not add the suffix due to space.
    if (!mdAndUp.value) {
        return result
    }

    const property: any = _.find(store.recipeProperties, {value: field})
    if (property) {
        const suffix = user.value.profile.units == "imperial" ? property.impSuffix || property.suffix : property.suffix
        if (suffix) {
            result += ` ${suffix}`
        }
    }

    return result
}

/**
 * Load the announcements and recently processed activities.
 */
const loadData = async () => {
    try {
        const cachedAnnouncements = getLocalStorage("active-announcements")
        if (cachedAnnouncements) {
            announcements.value = cachedAnnouncements
        } else {
            announcements.value = await api(`/api/announcements/${user.value.id}/active`)
            setLocalStorage("active-announcements", announcements.value, 600)
        }

        const cachedActivities = getLocalStorage("dashboard-activities")
        if (cachedActivities) {
            activities.value = cachedActivities
        } else {
            activities.value = await api(`/api/strava/${user.value.id}/processed-activities`, {query: {limit: 5}})
            setLocalStorage("dashboard-activities", activities.value, 60)
        }

        while (announcements.value.length > 0 && !lastAnnouncement.value) {
            const ann = announcements.value.pop()
            if (!getBrowserCookie(`announcement-${ann.id}`)) {
                lastAnnouncement.value = ann
                alertAnnouncement.value = true
            }
        }
    } catch (ex) {
        webError("Dashboard.loadData", ex)
    }
}

/**
 * Mark the current announcement as read.
 */
const readAnnouncement = async () => {
    if (!lastAnnouncement.value) return

    try {
        await api(`/api/announcements/${user.value.id}/read`, {method: "POST", body: {id: lastAnnouncement.value.id}})
    } catch (ex) {
        console.error("Dashboard.readAnnouncement", ex)
    }

    setBrowserCookie(`announcement-${lastAnnouncement.value.id}`, new Date().getTime(), 60 * 60 * 24 * 90)
    lastAnnouncement.value = null
}

onMounted(() => {
    getStravaStatus()
    loadData()
})
</script>
