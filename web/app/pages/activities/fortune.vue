<template>
    <div>
        <v-container fluid>
            <h1>Activity fortune</h1>
            <template v-if="!user || user.preferences?.privacyMode">
                <div>
                    The AI features are disabled when Privacy Mode is enabled. If you wish to test it, please disable the Privacy Mode on your
                    <nuxt-link to="/account" title="My Account">account preferences</nuxt-link>.
                </div>
            </template>
            <template v-else>
                <div>Try out Strautomator's generated activity names and descriptions, powered by AI!</div>
                <v-card class="mt-6" variant="outlined">
                    <v-card-text class="pb-2 pb-md-0">
                        <v-container class="ma-0 pa-0" fluid>
                            <v-row no-gutters>
                                <v-col cols="12" :sm="12" :md="4">
                                    <v-text-field v-model="activityId" label="Activity ID or URL" :loading="loading" variant="outlined" rounded density="compact"></v-text-field>
                                </v-col>
                                <v-col cols="12" :sm="12" :md="3">
                                    <v-select
                                        label="Provider"
                                        v-model="selectedAiProvider"
                                        class="ml-md-2 mt-n2 mt-md-0"
                                        item-value="value"
                                        item-title="text"
                                        :items="aiProviders"
                                        :disabled="loading"
                                        density="compact"
                                        variant="outlined"
                                        rounded
                                        return-object
                                    ></v-select>
                                </v-col>
                                <v-col cols="12" :sm="12" :md="3">
                                    <v-select
                                        label="Humour"
                                        v-model="selectedAiHumour"
                                        class="ml-md-2 mt-n2 mt-md-0"
                                        item-value="value"
                                        item-title="text"
                                        :items="aiHumours"
                                        :disabled="loading"
                                        density="compact"
                                        variant="outlined"
                                        rounded
                                        return-object
                                    ></v-select>
                                </v-col>
                                <v-col class="text-center text-md-right mt-1" cols="12" :sm="12" :md="2">
                                    <v-btn color="primary" class="mt-n4 mt-md-0" @click="getActivity()" :disabled="loading" rounded>
                                        <v-icon start>mdi-lightbulb</v-icon>
                                        Try it!
                                    </v-btn>
                                </v-col>
                            </v-row>
                            <v-row v-if="selectedAiHumour.value == 'custom'" no-gutters>
                                <v-col cols="12" class="pt-0 pb-0">
                                    <v-text-field v-model="customPrompt" label="Custom prompt" variant="outlined" rounded density="compact"></v-text-field>
                                </v-col>
                            </v-row>
                        </v-container>
                        <v-alert class="mt-4 mt-md-0" border="top" color="error" v-if="syncError">
                            {{ syncError }}
                        </v-alert>
                    </v-card-text>
                </v-card>
                <template v-if="activityName">
                    <v-card class="mt-4" variant="outlined">
                        <v-card-title class="bg-accent text-center text-md-left nobreak">
                            {{ activityName }}
                        </v-card-title>
                        <v-card-text>
                            <div class="mt-4 poem">{{ activityDescription }}</div>
                            <div class="mt-4">
                                Original activity: <a :href="'https://strava.com/activities/' + activity.id" target="strava">{{ activity.name }}</a>
                            </div>
                        </v-card-text>
                    </v-card>
                    <v-alert v-if="!user.isPro" class="mt-2" border="top" border-color="primary">
                        <p>
                            Activity poems auto generated with AI are available to PRO users only.
                            <br v-if="mdAndUp" />
                            Free accounts will still be able to use AI to generate activity names.
                        </p>
                        <v-btn color="primary" to="/billing" title="Subscribe to get a PRO account!" rounded>
                            <v-icon start>mdi-credit-card</v-icon>
                            Subscribe to PRO
                        </v-btn>
                    </v-alert>
                </template>
                <div class="text-caption mt-2" v-if="activity">
                    AI features are available via the "Generate the activity name" and "Generate a poem" automation actions. PRO users also have the option to get activity analysis on their private notes with AI.
                </div>
            </template>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

useHead({title: "Activity fortune"})

const api = useApi()
const store = useMainStore()
const {mdAndUp} = useDisplay()
const {user} = useUser()

const aiHumours = _.cloneDeep(store.aiHumours).map((h: string) => ({value: h, text: h.charAt(0).toUpperCase() + h.slice(1)}))
aiHumours.unshift({value: "", text: "Random"})
aiHumours.push({value: "custom", text: "Custom prompt"})

const loading = ref(false)
const activity = ref<any | false>(false)
const activityName = ref<string>(null)
const activityDescription = ref<string>(null)
const activityId = ref("")
const customPrompt = ref("")
const selectedAiHumour = ref(aiHumours[0])
const aiProviders = [
    {value: "openrouter", text: "Auto"},
    {value: "anthropic", text: "Anthropic"},
    {value: "deepseek", text: "DeepSeek"},
    {value: "gemini", text: "Gemini"},
    {value: "mistral", text: "Mistral"},
    {value: "openai", text: "OpenAI"},
    {value: "spacexai", text: "SpaceXAI"},
    {value: "zai", text: "Z.ai"}
]
const selectedAiProvider = ref<any>(aiProviders[0])
const syncError = ref<string>(null)

/**
 * Load the selected activity, or pick a recent processed one.
 */
const getActivity = async () => {
    activityName.value = null
    activityDescription.value = null
    activity.value = null

    if (activityId.value.trim() == "") {
        const activities: any[] = await api(`/api/strava/${user.value.id}/processed-activities`, {query: {limit: 10}})

        if (activities.length > 0) {
            activityId.value = _.sample(activities).id
        } else {
            syncError.value = "No processed activities found, please enter a activity ID or URL."
            return
        }
    } else if (isNaN(activityId.value as any)) {
        const arrUrl = activityId.value.replace("https://", "").split("/")

        if (arrUrl.length < 3) {
            syncError.value = "Invalid activity URL."
            return
        }

        activityId.value = arrUrl[2]
    }

    if (isNaN(activityId.value as any)) {
        syncError.value = "Invalid activity ID."
        return
    }

    try {
        loading.value = true
        syncError.value = null
        activity.value = await api(`/api/strava/${user.value.id}/activities/${activityId.value}/details`)

        if (activity.value) {
            await getFortune()
        } else {
            syncError.value = "Activity not available."
        }
    } catch (ex: any) {
        if (ex.response?.status == 404 || ex.message?.includes("Not Found")) {
            syncError.value = "Activity not found."
        } else {
            syncError.value = ex.data?.error || ex.response?._data?.error || ex.toString()
        }

        loading.value = false
    }
}

/**
 * Generate the activity name and description.
 */
const getFortune = async () => {
    try {
        loading.value = true
        syncError.value = null

        const body = {activity: activity.value, customPrompt: selectedAiHumour.value.value, provider: selectedAiProvider.value.value}
        if (selectedAiHumour.value.value == "custom") {
            body.customPrompt += `:${customPrompt.value}`
        }
        const result: any = await api(`/api/ai/${user.value.id}/activity-generate`, {method: "POST", body})

        activityName.value = result.name?.response || "Failed!"
        activityDescription.value = result.description?.response || "Failed!"
        loading.value = false
    } catch (ex: any) {
        syncError.value = ex.data?.message || ex.response?._data?.message || ex.toString()
        loading.value = false
    }
}
</script>
