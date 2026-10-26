<template>
    <div>
        <v-container fluid>
            <h1>Debug activity</h1>
            <v-card class="mb-4" variant="outlined">
                <v-card-text class="pb-2 pb-md-0">
                    <v-container class="ma-0 pa-0" fluid>
                        <v-row no-gutters>
                            <v-col cols="12" :sm="12" :md="10">
                                <v-text-field v-model="activityId" label="Activity ID or URL" :loading="loading" variant="outlined" rounded density="compact"></v-text-field>
                            </v-col>
                            <v-col class="text-center text-md-right mt-1" cols="12" :sm="12" :md="2">
                                <v-btn color="primary" class="mt-n6 mt-md-0" @click="setActivityRoute()" :loading="loading" :disabled="activityId.length < 5" rounded>
                                    <v-icon start>mdi-bug</v-icon>
                                    Debug
                                </v-btn>
                            </v-col>
                        </v-row>
                    </v-container>
                    <div v-if="activity === false" class="text-center text-md-left mt-4 mt-md-0 pb-md-4">Enter the activity URL or ID above.</div>
                </v-card-text>
            </v-card>

            <div v-if="loading">
                <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                Fetching details for activity {{ activityId }}...
            </div>
            <template v-else-if="activity">
                <v-alert border="top" color="error" v-if="syncError">
                    {{ syncError }}
                </v-alert>
                <v-card v-else variant="outlined">
                    <v-card-title class="bg-accent text-center text-md-left nobreak">Activity {{ activity.id }}</v-card-title>
                    <v-card-text>
                        <div class="mt-4">
                            <ul class="ml-0 pl-4">
                                <li v-for="(value, key) in activity" :key="key">
                                    <span class="font-weight-bold">{{ key }}</span>
                                    <span v-html="friendlyValue(value)"></span>
                                </li>
                            </ul>
                        </div>
                        <div v-if="garminActivity" class="mt-4">
                            <h3 class="mb-1">Garmin metadata:</h3>
                            <ul class="ml-0 pl-4">
                                <li v-for="(value, key) in garminActivity" :key="key">
                                    <span class="font-weight-bold">garmin.{{ key }}</span>
                                    {{ friendlyValue(value) }}
                                </li>
                            </ul>
                        </div>
                        <div v-if="wahooActivity" class="mt-4">
                            <h3 class="mb-1">Wahoo metadata:</h3>
                            <ul class="ml-0 pl-4">
                                <li v-for="(value, key) in wahooActivity" :key="key">
                                    <span class="font-weight-bold">wahoo.{{ key }}</span>
                                    {{ friendlyValue(value) }}
                                </li>
                            </ul>
                        </div>
                        <div v-if="processedActivity?.recipes" class="mt-4">
                            <h3 class="mb-1">Executed automations:</h3>
                            <ul class="ml-0 pl-4">
                                <li v-for="(value, key) in processedActivity.recipes" :key="key">
                                    <span class="font-weight-bold">{{ key }}</span>
                                    <br />
                                    {{ friendlyValue(value.actions) }}
                                </li>
                            </ul>
                            <div class="mt-4">Last processed: {{ $dayjs(processedActivity.dateProcessed).format("lll") }}</div>
                        </div>
                        <div v-if="user.isPro && (!activity.device || !activity.device.includes('garmin'))" class="mt-4">
                            <v-btn color="primary" title="Generate a .fit file for this activity" @click="fitDownload" rounded>Export FIT file</v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </template>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

useHead({title: "Debug activity"})

const api = useApi()
const route = useRoute()
const webError = useWebError()
const {user} = useUser()
const {activityIdFromUrl} = useStrava()

const loading = ref(false)
const activityId = ref("")
const activity = ref<any | false>(false)
const garminActivity = ref<any | false>(false)
const wahooActivity = ref<any | false>(false)
const processedActivity = ref<any>(null)
const syncError = ref<string>(null)

/**
 * Update the route query and load the selected activity.
 */
const setActivityRoute = async () => {
    await navigateTo({query: {id: activityId.value}}, {replace: true})
    await getActivity()
}

/**
 * Load activity details and matching metadata.
 */
const getActivity = async () => {
    const id = activityIdFromUrl(activityId.value)
    if (!id) {
        syncError.value = "Invalid activity ID or URL."
        return
    }

    try {
        loading.value = true
        syncError.value = null
        activity.value = null
        garminActivity.value = null
        wahooActivity.value = null

        const loadedActivity: any = await api(`/api/strava/${user.value.id}/activities/${activityId.value}/details`)
        if (!loadedActivity) {
            syncError.value = "Activity not found."
            return
        }

        // Polyline string is useless here, so take it out before assigning the activity.
        delete loadedActivity.polyline
        activity.value = loadedActivity

        if (user.value.isPro) {
            if (loadedActivity.device?.includes("Garmin")) {
                try {
                    const matchedGarminActivity: any = await api(`/api/garmin/${user.value.id}/match-activity/${activityId.value}`, {method: "POST"})
                    if (!matchedGarminActivity.notFound) {
                        garminActivity.value = matchedGarminActivity
                    }
                } catch (garminEx: any) {
                    console.error("ActivityDebug.getActivity Garmin", garminEx)
                }
            }
            if (loadedActivity.device?.includes("Wahoo")) {
                try {
                    const matchedWahooActivity: any = await api(`/api/wahoo/${user.value.id}/match-activity/${activityId.value}`, {method: "POST"})
                    if (!matchedWahooActivity.notFound) {
                        wahooActivity.value = matchedWahooActivity
                    }
                } catch (wahooEx: any) {
                    console.error("ActivityDebug.getActivity Wahoo", wahooEx)
                }
            }
        }

        try {
            const loadedProcessedActivity: any = await api(`/api/strava/${user.value.id}/processed-activities/${activityId.value}`)
            processedActivity.value = loadedProcessedActivity?.id ? loadedProcessedActivity : null
        } catch (innerEx) {
            processedActivity.value = null
        }
    } catch (ex: any) {
        if (ex.response?.status == 404 || ex.message?.includes("Not Found")) {
            syncError.value = "Activity not found."
        } else {
            syncError.value = ex.data?.error || ex.response?._data?.error || ex.toString()
        }
    } finally {
        loading.value = false
    }
}

const fitDownload = () => window.open(`/api/strava/${user.value.id}/${user.value.urlToken}/activities/${activity.value.id}/fit`, "_blank")

/**
 * Escape a debug value for HTML output.
 */
const escapeHtml = (value: any) => {
    if (value == null) {
        return ""
    }

    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;")
}

/**
 * Convert debug values to compact readable strings.
 */
const friendlyValue = (value: any): string => {
    if (_.isArray(value)) {
        return escapeHtml(value.map((a) => (_.isObject(a) ? Object.values(a).join(": ") : a)).join(", "))
    }
    if (_.isObject(value)) {
        const keys = Object.keys(value)
        return (
            "<br />" +
            keys
                .map((k) => {
                    const label = escapeHtml(k)
                    if (_.isArray(value[k])) {
                        return `${label}: [${escapeHtml(value[k].join(", "))}]`
                    }
                    if (_.isObject(value[k])) {
                        return `${label}: ${Object.entries(value[k])
                            .map(([subK, subV]) => `${escapeHtml(subK)} = ${escapeHtml(subV)}`)
                            .join(", ")}`
                    }
                    return `${label}: ${escapeHtml(value[k])}`
                })
                .join("<br />")
        )
    }

    return escapeHtml(value)
}

onMounted(async () => {
    try {
        if (route.query?.id) {
            activityId.value = route.query.id as string
            await getActivity()
        }
    } catch (ex) {
        webError("ActivityDebug.fetch", ex)
    }
})
</script>
