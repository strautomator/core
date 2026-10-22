<template>
    <div>
        <v-container fluid>
            <h1>Batch activities sync</h1>
            <template v-if="recipes.length == 0">
                <recipes-create-first />
            </template>
            <template v-else-if="activityCount === null">
                <div class="mb-4">Want to run your existing automations on older activities? You're just a few clicks away.</div>

                <ul class="ml-0 pl-4 pb-0 mb-4 mt-4">
                    <li>Process activities that ended up to {{ maxDays }} days ago{{ !user.isPro ? ` (PRO users gets up to ${store.proPlanDetails.batchDays} days).` : "." }}</li>
                    <li>Weather tags might not be available for activities older than 1 week (depends on location).</li>
                    <li>Activities are processed in small batches, and can take a few hours to complete.</li>
                    <li>Only 1 batch sync operation can be triggered every 24 hours.</li>
                </ul>

                <p v-if="user.isTrial">Please note that during your PRO trial period you can only process activities for a limited date range!</p>

                <p v-if="user.garmin || user.wahoo">
                    Want the Garmin / Wahoo sensor data of those older activities? You can
                    <nuxt-link to="/activities/fitupload" title="Upload a ZIP archive with your FIT files">upload their FIT files as a ZIP archive</nuxt-link>
                    first.
                </p>

                <v-card class="mt-6" v-if="!recentlyTriggered" variant="outlined">
                    <v-card-text class="mb-4 mb-md-0 pb-0">
                        <p>
                            <strong>Attention! This action is not reversible!</strong>
                            Please double check your automations and make sure that there are no misconfigured conditions that could trigger unwanted actions. Once you trigger the batch sync, there's no way to stop it.
                        </p>
                        <div v-if="!acceptRisks" class="mt-9">
                            <v-checkbox class="mt-n4" v-model="acceptRisks" label="I understand and accept the risks." density="compact" color="primary" />
                        </div>

                        <div class="mt-6" v-else>
                            <v-row no-gutters>
                                <v-col cols="12" class="pr-0 pr-md-2" :sm="12" :md="4">
                                    <v-select label="Activity privacy" v-model="filterPrivacy" :items="listFilterPrivacy" item-title="text" density="compact" variant="outlined" rounded></v-select>
                                </v-col>
                                <v-col cols="12" class="pr-0 pl-0 pr-md-2 pl-md-2" :sm="12" :md="4">
                                    <v-select label="Sport type" v-model="filterSport" :items="listFilterSport" item-title="text" density="compact" variant="outlined" rounded></v-select>
                                </v-col>
                                <v-col cols="12" class="pl-0 pl-md-2" :sm="12" :md="4">
                                    <v-select label="Activity type" v-model="filterType" :items="listFilterType" item-title="text" density="compact" variant="outlined" rounded></v-select>
                                </v-col>
                            </v-row>

                            <v-row no-gutters>
                                <v-col cols="12" class="pr-0 pr-md-2" :sm="12" :md="4">
                                    <v-menu v-model="dateFromMenu" :close-on-content-click="false" transition="scale-transition" min-width="290px" location="bottom">
                                        <template #activator="{props: menuProps}">
                                            <v-text-field v-model="dateFrom" v-bind="menuProps" width="200px" label="From date" type="text" prepend-icon="mdi-calendar" variant="outlined" readonly rounded density="compact"></v-text-field>
                                        </template>
                                        <v-date-picker v-model="dateFromPicker" :min="dateFromMin" :max="dateFromMax" @update:model-value="updateDateFrom" hide-header></v-date-picker>
                                    </v-menu>
                                </v-col>
                                <v-col cols="12" class="pr-0 pl-0 pr-md-2 pl-md-2" :sm="12" :md="4">
                                    <v-menu v-model="dateToMenu" :close-on-content-click="false" transition="scale-transition" min-width="290px" location="bottom">
                                        <template #activator="{props: menuProps}">
                                            <v-text-field v-model="dateTo" v-bind="menuProps" width="200px" label="To date" type="text" prepend-icon="mdi-calendar" variant="outlined" readonly rounded density="compact"></v-text-field>
                                        </template>
                                        <v-date-picker v-model="dateToPicker" :min="dateToMin" :max="dateToMax" @update:model-value="updateDateTo" hide-header></v-date-picker>
                                    </v-menu>
                                </v-col>
                                <v-col cols="12" class="text-center text-md-right" :sm="12" :md="4">
                                    <v-btn color="primary" class="ml-2" title="Start the batch job" @click="processActivities" :disabled="loading" rounded>
                                        <v-icon start>mdi-animation-play</v-icon>
                                        Batch process activities
                                    </v-btn>
                                </v-col>
                            </v-row>
                            <div class="mb-4 text-center text-md-right mt-md-n3" v-if="loading">
                                <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                                Preparing the batch job, please wait...
                            </div>
                        </div>
                    </v-card-text>
                </v-card>
                <div v-else>
                    <v-alert border="top" border-color="error">
                        <div class="mt-1">You have triggered a batch sync {{ $dayjs(user.dateLastBatchProcessing).fromNow() }}. Please wait at least 24 hours before executing a batch sync again.</div>
                    </v-alert>
                    <v-btn class="mt-1" color="primary" title="Go to my automations history" to="/automations/history" size="small" rounded>
                        <v-icon start>mdi-history</v-icon>
                        Go to automation history
                    </v-btn>
                </div>
            </template>
            <template v-else>
                <v-alert border="top" color="error" v-if="jobError">
                    {{ jobError }}
                </v-alert>
                <v-card v-else variant="outlined">
                    <v-card-title class="bg-accent">{{ batchTitle }}</v-card-title>
                    <v-card-text class="pt-4">
                        <div v-if="activityCount < 1">
                            <p>No valid activities were found between {{ $dayjs(dateFrom).format("ll") }} and {{ $dayjs(dateTo).format("ll") }}.<br v-if="mdAndUp" />You might want to try extending the date range or removing some activity filters.</p>
                            <v-btn class="mt-1" color="primary" title="Try again" @click="activityCount = null" size="small" rounded>
                                <v-icon start>mdi-arrow-left</v-icon>
                                Try again
                            </v-btn>
                        </div>
                        <div v-else-if="batchProcessed">Activities between {{ $dayjs(dateFrom).format("ll") }} and {{ $dayjs(dateTo).format("ll") }} are being processed right now, and should be updated in a few minutes.</div>
                        <div v-else>
                            Activities between {{ $dayjs(dateFrom).format("ll") }} and {{ $dayjs(dateTo).format("ll") }} are now queued for processing.<br v-if="mdAndUp" />This asynchronous job can take up to {{ maxHours }} hour(s) to complete.
                            <div class="mt-3">You can keep track of what's already automated on your automation history.</div>
                        </div>
                        <v-btn v-if="activityCount > 0" class="mt-4" color="primary" title="Go to my automations history" to="/automations/history" size="small" rounded>
                            <v-icon start>mdi-history</v-icon>
                            Go to automation history
                        </v-btn>
                    </v-card-text>
                </v-card>
            </template>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Batch activities sync"})

const api = useApi()
const store = useMainStore()
const {mdAndUp} = useDisplay()
const {user} = useUser()
const {getSportName} = useStrava()
const {$dayjs}: any = useNuxtApp()

const defaultDateFrom = $dayjs().subtract(store.freePlanDetails.batchDays, "days").format("YYYY-MM-DD")
const defaultDateTo = $dayjs().format("YYYY-MM-DD")

const loading = ref(false)
const jobError = ref<string>(null)
const acceptRisks = ref(false)
const activityCount = ref<number | null>(null)
const batchProcessed = ref(false)
const dateFrom = ref(defaultDateFrom)
const dateFromPicker = ref<Date | null>($dayjs(defaultDateFrom).toDate())
const dateFromMenu = ref(false)
const dateTo = ref(defaultDateTo)
const dateToPicker = ref<Date | null>($dayjs(defaultDateTo).toDate())
const dateToMenu = ref(false)
const filterPrivacy = ref("all")
const filterSport = ref("all")
const filterType = ref("all")
const listFilterPrivacy = [
    {value: "all", text: "All activities"},
    {value: "private", text: "Private activities"},
    {value: "public", text: "Public activities"}
]
const listFilterType = [
    {value: "all", text: "All types"},
    {value: "commute", text: "Just commutes"},
    {value: "notCommute", text: "Exclude commutes"},
    {value: "race", text: "Just races"},
    {value: "notRace", text: "Exclude races"}
]
const listFilterSport = [{value: "all", text: "All sports"}, ...store.sportTypes.map((st: string) => ({value: st, text: getSportName(st)}))]

const recipes = computed(() => Object.values(user.value.recipes))
const recentlyTriggered = computed(() => {
    if (!user.value.dateLastBatchProcessing) return false
    return $dayjs().subtract(24, "hours").isBefore($dayjs(user.value.dateLastBatchProcessing))
})
const maxDays = computed(() => (!user.value.isTrial && user.value.isPro ? store.proPlanDetails.batchDays : store.freePlanDetails.batchDays))
const maxHours = computed(() => Math.ceil((activityCount.value || 0) / 70))
const dateFromMin = computed(() => $dayjs().subtract(maxDays.value, "days").format("YYYY-MM-DD"))
const dateFromMax = computed(() => {
    const today = $dayjs()
    const currentDateTo = $dayjs(dateTo.value)
    return today.isAfter(currentDateTo) ? currentDateTo.format("YYYY-MM-DD") : today.format("YYYY-MM-DD")
})
const dateToMin = computed(() => $dayjs(dateFrom.value).format("YYYY-MM-DD"))
const dateToMax = computed(() => $dayjs().format("YYYY-MM-DD"))
const batchTitle = computed(() => {
    if ((activityCount.value || 0) < 1) return "No activities found"
    if (batchProcessed.value) return `Processing ${activityCount.value} activities`
    return `Will process ${activityCount.value} activities`
})

/**
 * Convert the from-date picker value to the YYYY-MM-DD string expected by the API.
 */
const updateDateFrom = (value: Date | null) => {
    dateFromPicker.value = value
    dateFrom.value = value ? $dayjs(value).format("YYYY-MM-DD") : null
    dateFromMenu.value = false
}

/**
 * Convert the to-date picker value to the YYYY-MM-DD string expected by the API.
 */
const updateDateTo = (value: Date | null) => {
    dateToPicker.value = value
    dateTo.value = value ? $dayjs(value).format("YYYY-MM-DD") : null
    dateToMenu.value = false
}

/**
 * Queue the batch activity processing job.
 */
const processActivities = async () => {
    try {
        jobError.value = null
        loading.value = true

        const data = {
            dateFrom: dateFrom.value,
            dateTo: dateTo.value,
            filterPrivacy: filterPrivacy.value,
            filterSport: filterSport.value,
            filterType: filterType.value
        }

        const result: any = await api(`/api/strava/${user.value.id}/process-activities`, {method: "POST", body: data})

        activityCount.value = result.activityCount || 0
        batchProcessed.value = result.processed
    } catch (ex: any) {
        activityCount.value = 0
        jobError.value = ex.data?.message || ex.response?._data?.message || ex.toString()
    } finally {
        loading.value = false
    }
}
</script>
