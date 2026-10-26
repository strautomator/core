<template>
    <div>
        <v-container fluid>
            <h1>
                Automation history
                <v-btn class="float-right mt-3 text-h6 font-weight-bold" color="primary" to="/dashboard/charts" title="Go to automations chart" size="32" icon><v-icon size="small">mdi-poll</v-icon></v-btn>
            </h1>

            <v-card variant="outlined">
                <v-card-text class="pa-0">
                    <v-row class="pt-7 pb-2 pb-md-0">
                        <v-col cols="6" md="3" class="text-center text-md-left pb-0 pt-0 pl-6">
                            <v-menu v-model="dateFromMenu" :close-on-content-click="false" transition="scale-transition" min-width="290px" location="bottom">
                                <template #activator="{props}">
                                    <v-text-field v-model="dateFrom" v-bind="props" label="From date" type="text" :disabled="loading" variant="outlined" readonly rounded density="compact"></v-text-field>
                                </template>
                                <v-date-picker v-model="dateFromModel" :max="dateToModel" :min="minDateFrom" hide-header @update:model-value="dateFromMenu = false"></v-date-picker>
                            </v-menu>
                        </v-col>
                        <v-col cols="6" md="3" class="text-center text-md-left pb-0 pt-0 pr-6">
                            <v-menu v-model="dateToMenu" :close-on-content-click="false" transition="scale-transition" min-width="290px" location="bottom">
                                <template #activator="{props}">
                                    <v-text-field v-model="dateTo" v-bind="props" label="To date" type="text" :disabled="loading" variant="outlined" readonly rounded density="compact"></v-text-field>
                                </template>
                                <v-date-picker v-model="dateToModel" :min="dateFromModel" hide-header @update:model-value="dateToMenu = false"></v-date-picker>
                            </v-menu>
                        </v-col>
                        <v-col cols="12" md="2" class="text-center text-md-left pb-0 pt-1 mt-n4 mt-md-0">
                            <v-btn color="primary" title="Search history of processed activities" @click="fetchHistory()" :disabled="loading" rounded>
                                <v-icon start>mdi-table-search</v-icon>
                                Search activities
                            </v-btn>
                        </v-col>
                    </v-row>

                    <v-divider class="mt-4 mt-md-n3" />

                    <div class="mt-4 mb-4 pl-4 pr-4" v-if="loading">
                        <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                        Loading history...
                    </div>

                    <div class="mt-4 mb-4 pl-4 pr-4" v-else-if="activities && activities.length == 0">
                        No processed activities found from
                        <br v-if="!mdAndUp" />
                        {{ dateFrom }} to {{ dateTo }}.
                    </div>

                    <processed-activities :activities="activities" :header="true" v-else></processed-activities>
                </v-card-text>
            </v-card>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs"

useHead({title: "Automation history"})

const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()

const loading = ref(true)
const activities = ref<any[] | null>(null)
const dateFromMenu = ref(false)
const dateFrom = ref<string | null>(null)
const dateToMenu = ref(false)
const dateTo = ref(dayjs().format("YYYY-MM-DD"))
const minDateFrom = dayjs().subtract(2, "years").toDate()

const dateFromModel = computed({
    get: () => (dateFrom.value ? dayjs(dateFrom.value).toDate() : null),
    set: (value: Date | null) => {
        if (value) dateFrom.value = dayjs(value).format("YYYY-MM-DD")
    }
})
const dateToModel = computed({
    get: () => (dateTo.value ? dayjs(dateTo.value).toDate() : null),
    set: (value: Date | null) => {
        if (value) dateTo.value = dayjs(value).format("YYYY-MM-DD")
    }
})

/**
 * Fetch processed activity history for the selected date range.
 */
const fetchHistory = async () => {
    try {
        loading.value = true
        activities.value = await api(`/api/strava/${user.value.id}/processed-activities`, {query: {from: dateFrom.value, to: dateTo.value}})
    } catch (ex) {
        webError("History.fetchHistory", ex)
    }

    loading.value = false
}

onMounted(async () => {
    if (!dateFrom.value) {
        dateFrom.value = dayjs(user.value.dateLastProcessedActivity).subtract(1, "month").startOf("month").format("YYYY-MM-DD")
    }

    await fetchHistory()
})
</script>
