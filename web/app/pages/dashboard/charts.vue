<template>
    <div>
        <v-container fluid>
            <h1>
                Charts
                <v-btn class="float-right mt-3 text-h6 font-weight-bold" color="primary" to="/automations/history" title="Go to automation history" size="32" icon><v-icon size="small">mdi-history</v-icon></v-btn>
            </h1>

            <v-card variant="outlined">
                <v-card-text>
                    <div class="d-flex" :class="{'flex-column': !mdAndUp}">
                        <div class="flex-grow-0">
                            <v-select label="Charts" v-model="chartSource" :items="chartSourceList" :class="{'mr-2': mdAndUp}" :min-width="mdAndUp ? 304 : undefined" variant="outlined" rounded density="compact" item-title="text"></v-select>
                        </div>
                        <div class="flex-grow-0">
                            <v-select label="Period" v-model="period" :items="periodList" :class="{'mr-2': mdAndUp}" :min-width="mdAndUp ? 304 : undefined" variant="outlined" rounded density="compact" item-title="text"></v-select>
                        </div>
                        <div class="flex-grow-0">
                            <v-select label="Chart style" :min-width="mdAndUp ? 252 : undefined" v-model="chartType" :items="chartTypeList" variant="outlined" rounded density="compact" item-title="text"></v-select>
                        </div>
                    </div>
                    <div class="mt-4 pl-4 pr-4" v-if="loading">
                        <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                        <span>Loading statistics...</span>
                    </div>
                    <div v-else-if="!processedActivities || processedActivities.length == 0" class="mt-4 pl-4 pr-4">
                        <span>No processed activities found to display statistics.</span>
                    </div>
                    <canvas ref="mainChart" :height="mdAndUp ? undefined : '320'"></canvas>
                </v-card-text>
            </v-card>

            <v-alert class="mt-4 text-center text-md-left">
                <div class="mb-3 mb-md-0">
                    Thinking about the future instead?
                    <br v-if="!mdAndUp" />
                    See your upcoming events on the <nuxt-link to="/map" title="View your upcoming club events on the map">Map</nuxt-link>.
                </div>
            </v-alert>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import type {Chart as ChartType} from "chart.js"
import dayjs from "dayjs"
import _ from "lodash"

useHead({title: "Charts"})

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()

const mainChart = useTemplateRef<HTMLCanvasElement>("mainChart")
const loading = ref(true)
const dayFormat = "MMM Do"
const chartSource = ref("automations")
const chartSourceList = [{value: "automations", text: "Automations"}]
const chartTypeList = [
    {value: "bar", text: "Bars"},
    {value: "line", text: "Lines"}
]
const period = ref(28)
const periodList = [
    {value: 28, text: "Last 4 weeks"},
    {value: 90, text: "Last 3 months"},
    {value: 180, text: "Last 6 months"},
    {value: 365, text: "Last year"}
]
const chartType = ref("bar")
const suggestedMax = ref(1)
const processedActivities = ref<any[]>(null)
let Chart: typeof ChartType = null
let chart: ChartType = null

watch([chartSource, period, chartType], () => createChart())

/**
 * Load processed activities used as chart data.
 */
const loadData = async () => {
    try {
        processedActivities.value = await api(`/api/strava/${user.value.id}/processed-activities`)
    } catch (ex) {
        webError("Charts.fetch", ex)
    }
}

/**
 * Create or recreate the main chart.
 */
const createChart = () => {
    if (loading.value) {
        loading.value = false
    }

    if (!Chart || !mainChart.value || !processedActivities.value || processedActivities.value.length == 0) {
        return
    }

    let now = dayjs()
    const datasets: any[] = []

    const bgColors = ["#F44336AA", "#9C27B0AA", "#3F51B5AA", "#00BCD4AA", "#009688AA", "#CDDC39AA", "#795548AA", "#607D8BAA", "#4CAF50AA"]
    const activities = _.cloneDeep(processedActivities.value)
    const timeUnit = period.value > 90 ? "month" : period.value > 28 ? "week" : "day"

    for (let recipe of Object.values(store.user.recipes) as any[]) {
        const dataset: any = {
            uid: recipe.id,
            label: recipe.title,
            data: []
        }

        if (chartType.value == "bar") {
            dataset.backgroundColor = bgColors.shift()
        } else {
            dataset.borderColor = bgColors.shift()
        }

        datasets.push(dataset)
    }

    suggestedMax.value = 1
    now = now.subtract(period.value, "days")
    _.remove(activities, getActivityDateFilter(now))

    for (let i = period.value; i > 0; i--) {
        if (period.value > 180) {
            i -= 14
            now = now.add(15, "days")
        } else if (period.value > 90) {
            i -= 6
            now = now.add(7, "days")
        } else {
            now = now.add(1, "days")
        }

        populateDatapoints(datasets, activities, now)
    }

    if (chart) {
        chart.destroy()
    }

    chart = new Chart(mainChart.value, {
        type: chartType.value as any,
        options: {
            responsive: true,
            scales: {
                x: {
                    axis: "x",
                    type: "time",
                    time: {
                        unit: timeUnit,
                        tooltipFormat: "YYYY-MM-DD"
                    }
                },
                y: {
                    axis: "y",
                    suggestedMax: suggestedMax.value,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (items: any[]) => {
                            const tti = items[0]
                            const tDate = tti.label.toString()

                            if (period.value > 180) {
                                const fromDate = dayjs(tDate).subtract(15, "days")
                                const toDate = dayjs(tDate)
                                return `${fromDate.format(dayFormat)} to ${toDate.format(dayFormat)}`
                            }

                            if (period.value > 90) {
                                const fromDate = dayjs(tDate).subtract(7, "days")
                                const toDate = dayjs(tDate)
                                return `${fromDate.format(dayFormat)} to ${toDate.format(dayFormat)}`
                            }

                            return dayjs(tti.label).format(dayFormat)
                        }
                    }
                }
            }
        },
        data: {
            datasets: datasets
        }
    })
}

/**
 * Build a filter that removes activities before a date.
 */
const getActivityDateFilter = (maxMoment: any) => {
    return (a: any) => dayjs(a.dateStart).unix() + (a.utcStartOffset || 0) <= maxMoment.utc().unix()
}

/**
 * Add data points for all datasets at a specific date.
 */
const populateDatapoints = (datasets: any[], activities: any[], maxMoment: any) => {
    const periodActivities = _.remove(activities, getActivityDateFilter(maxMoment))

    for (let ds of datasets) {
        const counter = _.filter(periodActivities, (a) => a.recipes?.[ds.uid]).length

        if (counter >= suggestedMax.value) {
            suggestedMax.value = counter + 1
        }

        ds.data.push({x: maxMoment.toDate(), y: counter})
    }
}

onMounted(async () => {
    // Chart.js and its date adapter are browser-only, so load them on the client.
    Chart = (await import("chart.js/auto")).default
    await import("chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm.js")
    await loadData()
    await nextTick()
    setTimeout(createChart, 1500)
})

onBeforeUnmount(() => {
    if (chart) {
        chart.destroy()
    }
})
</script>
