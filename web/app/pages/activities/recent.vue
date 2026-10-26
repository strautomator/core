<template>
    <div>
        <v-container fluid>
            <h1>Recent activities</h1>
            <div>Want to try out your automations or debug your recent Strava activities?</div>
            <div class="mt-4" v-if="loading">
                <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                Loading recent activities from Strava...
            </div>
            <v-table class="mt-4" v-else>
                <thead v-if="mdAndUp && recentActivities.length > 0">
                    <tr>
                        <th></th>
                        <th>Activity</th>
                        <th>Distance</th>
                        <th>Total Time</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="recentActivities.length == 0">
                        <td :colspan="mdAndUp ? 5 : 2" class="pt-4 pb-2 pl-8">No recent activities found.</td>
                    </tr>
                    <tr v-for="activity in recentActivities" :key="activity.id">
                        <td width="1">
                            <v-icon>{{ getSportIcon(activity.sportType) }}</v-icon>
                        </td>
                        <td>
                            <div class="mt-2 mb-2">
                                <template v-if="!mdAndUp">
                                    <div class="font-weight-bold">{{ activity.name }}</div>

                                    <div class="mt-2 float-right">
                                        <v-btn color="primary" :title="`Debug the activity ${activity.id}`" @click="debugActivity(activity.id)" icon="mdi-bug-outline" size="small" variant="outlined"></v-btn>
                                        <v-btn color="primary" class="ml-2" :title="`Try automations on activity ${activity.id}`" @click="syncActivity(activity.id)" rounded size="small">
                                            <v-icon class="mr-md-1">mdi-playlist-play</v-icon>
                                        </v-btn>
                                    </div>

                                    <div class="text-caption">
                                        {{ getDate(activity.dateStart).format("lll") }}
                                        <br />
                                        <template v-if="activity.distance">{{ activity.distance }} {{ user.profile.units == "imperial" ? "mi" : "km" }}</template>
                                        <template v-else-if="activity.hrAvg">{{ activity.hrAvg }} bpm</template>
                                    </div>
                                </template>
                                <template v-else>
                                    {{ activity.name }}
                                    <br />
                                    {{ getDate(activity.dateStart).format("lll") }}
                                </template>
                            </div>
                        </td>
                        <template v-if="mdAndUp">
                            <td>
                                {{ activity.distance }}
                                {{ user.profile.units == "imperial" ? "mi" : "km" }}
                            </td>
                            <td>
                                {{ getDuration(activity.totalTime) }}
                            </td>
                            <td class="text-right">
                                <v-btn color="primary" :title="`Debug the activity ${activity.id}`" @click="debugActivity(activity.id)" size="small" rounded variant="outlined">
                                    <v-icon class="mr-md-1">mdi-bug-outline</v-icon>
                                    Debug
                                </v-btn>
                                <v-btn color="primary" class="ml-2" :title="`Try automations on activity ${activity.id}`" @click="syncActivity(activity.id)" size="small" rounded>
                                    <v-icon class="mr-md-1">mdi-playlist-play</v-icon>
                                    Process
                                </v-btn>
                            </td>
                        </template>
                    </tr>
                    <tr>
                        <td :colspan="mdAndUp ? 5 : 2" class="pt-4 pb-4 pb-md-2">
                            <v-row no-gutters>
                                <v-col :cols="mdAndUp ? 8 : 12">
                                    <div class="text-caption ml-4 mb-1">Another activity?</div>
                                    <div>
                                        <v-text-field v-model="activityId" label="ID or URL" variant="outlined" rounded density="compact"></v-text-field>
                                    </div>
                                </v-col>
                                <v-col class="text-center text-md-right mt-n4 mt-md-0" :cols="mdAndUp ? 4 : 12">
                                    <v-btn color="primary" class="mt-md-6" title="Debug the activity specified" :disabled="activityId.length < 5" @click="debugActivity()" rounded variant="outlined">
                                        <v-icon class="mr-md-1">mdi-bug-outline</v-icon>
                                        Debug
                                    </v-btn>
                                    <v-btn color="primary" class="mt-md-6 ml-2" title="Process the activity specified" :disabled="activityId.length < 5" @click="syncActivity()" rounded>
                                        <v-icon class="mr-md-1">mdi-playlist-play</v-icon>
                                        Process
                                    </v-btn>
                                </v-col>
                            </v-row>
                        </td>
                    </tr>
                </tbody>
            </v-table>

            <div class="mt-4" v-if="recipes.length == 0">
                <recipes-create-first />
            </div>
            <v-card class="mt-4" variant="outlined">
                <v-card-text>
                    <div class="text-center text-md-left">
                        <div>Want to execute your current automations on many Strava activities at once?</div>
                        <v-btn color="primary" class="mt-4" to="/activities/batchsync" rounded>
                            <v-icon start>mdi-animation-play</v-icon>
                            Proceed to batch processing
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Recent activities"})

const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()
const {getSportIcon, activityIdFromUrl} = useStrava()
const {$dayjs}: any = useNuxtApp()

const loading = ref(true)
const recentActivities = ref<any[]>([])
const activityId = ref("")

const recipes = computed(() => Object.values(user.value.recipes))

const getDate = (date: any) => $dayjs(date)

/**
 * Format duration as HH:mm.
 */
const getDuration = (seconds: number) => {
    const duration = $dayjs.duration(seconds, "seconds")
    let hours: any = duration.hours()
    let minutes: any = duration.minutes()
    if (hours < 10) hours = `0${hours}`
    if (minutes < 10) minutes = `0${minutes}`
    return `${hours}:${minutes}`
}

/**
 * Parse the activity ID from the input field.
 */
const parseActivityId = () => {
    const parsed = activityIdFromUrl(activityId.value)
    if (parsed) activityId.value = parsed
    return parsed
}

const syncActivity = (id?: string) => {
    const targetId = id || parseActivityId()
    return navigateTo({path: `/activities/sync`, query: {id: targetId}})
}

const debugActivity = (id?: string) => {
    const targetId = id || parseActivityId()
    return navigateTo({path: `/activities/debug`, query: {id: targetId}})
}

/**
 * Load recent Strava activities.
 */
const loadData = async () => {
    try {
        loading.value = true
        recentActivities.value = await api(`/api/strava/${user.value.id}/activities/recent`)
    } catch (ex) {
        webError("ActivitiesRecent.fetch", ex)
    } finally {
        loading.value = false
    }
}

onMounted(loadData)
</script>
