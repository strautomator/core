<template>
    <div>
        <v-container fluid>
            <h1>Process activity</h1>
            <template v-if="recipes.length > 0">
                <v-card class="mb-4" variant="outlined">
                    <v-card-text class="pb-2 pb-md-0">
                        <v-container class="ma-0 pa-0" fluid>
                            <v-row no-gutters>
                                <v-col cols="12" :sm="12" :md="10">
                                    <v-text-field v-model="activityId" label="Activity ID or URL" :loading="loading" variant="outlined" rounded density="compact"></v-text-field>
                                </v-col>
                                <v-col class="text-center text-md-right mt-1" cols="12" :sm="12" :md="2">
                                    <v-btn color="primary" class="mt-n6 mt-md-0" @click="setActivityRoute()" :loading="loading" :disabled="activityId.length < 5" rounded>
                                        <v-icon start>mdi-playlist-play</v-icon>
                                        Process
                                    </v-btn>
                                </v-col>
                            </v-row>
                        </v-container>
                        <div v-if="processedActivity === false" class="text-center text-md-left mt-4 mt-md-0 pb-md-4">Enter the activity URL or ID above.</div>
                    </v-card-text>
                </v-card>

                <div v-if="loading">
                    <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                    Processing activity {{ activityId }}...
                </div>
                <template v-else>
                    <v-alert border="top" color="error" v-if="syncError">
                        {{ syncError }}
                    </v-alert>
                    <v-card v-else variant="outlined">
                        <v-card-title class="bg-accent">Activity {{ activityId }}</v-card-title>
                        <v-card-text>
                            <div class="mt-4" v-if="!processedActivity || recipeKeys.length == 0">No automations were triggered for this activity.</div>
                            <div class="mt-4" v-else>
                                <v-alert color="error" v-if="processedActivity.error" class="mt-4 mb-4">
                                    <div class="font-weight-bold">Sync error!</div>
                                    <div>
                                        {{ processedActivity.error }}
                                    </div>
                                </v-alert>
                                <div class="font-weight-bold">Name: {{ processedActivity.name }}</div>
                                <div>Date: {{ getDate(processedActivity.dateStart).format("lll") }}</div>

                                <div class="mt-4">Updated fields:</div>
                                <ul class="mt-1 pl-4 action-list">
                                    <li class="font-weight-medium" v-for="(field, index) in updatedFieldsKeys" :key="`ufield-${index}`">
                                        <span class="text-capitalize">{{ field }}:</span>
                                        {{ processedActivity.updatedFields[field] }}
                                    </li>
                                    <li v-if="updatedFieldsKeys.length == 0">None</li>
                                </ul>
                                <div class="mt-4">Triggered automations:</div>
                                <ul class="mt-1 pl-4 action-list">
                                    <li class="font-weight-medium" v-for="recipeId in recipeKeys" :key="recipeId">
                                        <nuxt-link :to="'/automations/edit?id=' + recipeId" :title="processedActivity.recipes[recipeId].title">
                                            {{ processedActivity.recipes[recipeId].title }}
                                        </nuxt-link>
                                    </li>
                                </ul>
                            </div>
                            <v-alert color="accent" class="mt-4 text-caption text-center text-md-left pa-2 mb-0" v-if="hasWeather">Weather conditions and tags might not be available for activities older than 1 week.</v-alert>
                        </v-card-text>
                    </v-card>
                    <div class="mt-4 text-center text-md-left">
                        <v-btn color="primary" title="Debug this activity" @click="debugActivity" rounded>
                            <v-icon start>mdi-text-search</v-icon>
                            Debug this activity
                        </v-btn>
                    </div>
                </template>
            </template>

            <template v-else>
                <recipes-create-first />
            </template>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Process activity"})

const api = useApi()
const route = useRoute()
const {user} = useUser()
const {activityIdFromUrl} = useStrava()
const {$dayjs}: any = useNuxtApp()

const loading = ref(true)
const activityId = ref("")
const processedActivity = ref<any | false>(false)
const syncError = ref<string>(null)

const recipes = computed(() => Object.values(user.value.recipes))
const recipeKeys = computed(() => (!processedActivity.value || !processedActivity.value.recipes ? [] : Object.keys(processedActivity.value.recipes)))
const updatedFieldsKeys = computed(() => (!processedActivity.value || !processedActivity.value.updatedFields ? [] : Object.keys(processedActivity.value.updatedFields)))
const hasWeather = computed(() => {
    if (!processedActivity.value || !processedActivity.value.recipes) return false
    const recipeIds = Object.keys(processedActivity.value.recipes)
    for (let r = 0; r < recipeIds.length; r++) {
        const recipe = user.value.recipes[r]
        if (recipe && JSON.stringify(recipe).includes("weather.")) {
            return true
        }
    }
    return false
})

const getDate = (date: any) => $dayjs(date)

/**
 * Update the route query and process the selected activity.
 */
const setActivityRoute = async () => {
    await navigateTo({query: {id: activityId.value}}, {replace: true})
    await syncActivity()
}

/**
 * Process the activity with the current automations.
 */
const syncActivity = async () => {
    const id = activityIdFromUrl(activityId.value)
    if (!id) {
        syncError.value = "Invalid activity ID or URL."
        loading.value = false
        return
    }

    try {
        loading.value = true
        syncError.value = null
        processedActivity.value = null

        processedActivity.value = await api(`/api/strava/${user.value.id}/process-activity/${id}`)
    } catch (ex: any) {
        processedActivity.value = null
        syncError.value = ex.data?.message || ex.response?._data?.message || ex.toString()
    } finally {
        loading.value = false
    }
}

const debugActivity = () => navigateTo({path: "/activities/debug", query: {id: activityId.value}})

onMounted(async () => {
    loading.value = false
    if (route.query?.id) {
        activityId.value = route.query.id as string
        await syncActivity()
    }
})
</script>
