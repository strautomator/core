<template>
    <div>
        <v-container v-if="invalidGear" fluid>
            <v-card variant="outlined">
                <v-card-title class="bg-accent">
                    <span>Invalid or deprecated gear</span>
                </v-card-title>
                <v-card-text class="pt-2">The gear ID "{{ gearId }}" could not be found on your profile. It was probably deleted from your Strava account, and if that's the case, it will also be deleted from Strautomator soon.</v-card-text>
            </v-card>
            <div class="mt-4 text-center text-md-left">
                <v-btn color="primary" to="/gear" rounded>
                    <v-icon start>mdi-arrow-left</v-icon>
                    Back to My Gear
                </v-btn>
            </div>
        </v-container>
        <v-container v-else-if="gear" fluid>
            <h1>
                <v-icon class="mr-1 mt-n1">{{ getGearIcon(gear) }}</v-icon>
                {{ gear.name }}
            </h1>
            <div>
                <span v-if="hasBrandModel">{{ gear.brand }} {{ gear.model }} </span>
                <br v-if="!mdAndUp" />
                {{ mdAndUp ? "with" : "" }} {{ gear.distance }} {{ distanceUnits }}
            </div>
            <div v-if="gearwearConfig?.lastUpdate">Last tracking update: {{ $dayjs(gearwearConfig.lastUpdate.date).format("ll") }}</div>

            <template v-if="gearwearConfig?.disabled">
                <v-alert class="mt-4" color="error"> This gear configuration was automatically disabled due to repeated tracking failures! This usually happens if you have retired or deleted the gear on your Strava profile. </v-alert>
                <v-btn class="mt-2 mb-4" color="primary" title="Re-enable this GearWear configuration" @click="reenableGear()" rounded size="small">Re-enable it now</v-btn>
            </template>

            <div v-if="isLoading">
                <v-card class="mb-4 mt-4" variant="outlined">
                    <v-card-text class="pl-2 pr-2">
                        <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                        Loading gear details...
                    </v-card-text>
                </v-card>
            </div>

            <div class="mt-5 mb-3" v-else>
                <template v-if="gearwearConfig?.components.length > 0">
                    <v-row>
                        <v-col cols="12" sm="12" md="6" v-for="comp of gearwearConfig.components" :key="comp.name">
                            <v-card variant="outlined">
                                <v-hover v-slot="{isHovering, props: hoverProps}">
                                    <a v-bind="hoverProps" :title="'Edit details of ' + comp.name" @click="showComponentDialog(comp)">
                                        <v-card-title class="bg-accent">
                                            <v-icon color="primary" class="mr-2">{{ getComponentIcon(comp) }}</v-icon>
                                            <span>{{ comp.name }}</span>
                                            <v-icon class="ml-2" v-show="isHovering" size="small">mdi-pencil-outline</v-icon>
                                            <v-spacer></v-spacer>
                                            <span class="text-grey text-caption" v-if="comp.disabled">DISABLED</span>
                                        </v-card-title>
                                    </a>
                                </v-hover>
                                <v-card-text class="pa-0">
                                    <v-row class="pl-5 pr-5" no-gutters>
                                        <v-col cols="12">
                                            <div class="mt-4">
                                                <span>{{ comp.currentDistance }} {{ distanceUnits }}</span>
                                                <span class="float-right" v-if="comp.alertDistance">{{ comp.alertDistance }} {{ distanceUnits }}</span>
                                                <span class="float-right" v-else>-</span>
                                                <v-progress-linear
                                                    class="mt-2"
                                                    v-if="comp.alertDistance"
                                                    :color="getProgressColor(comp)"
                                                    :bg-color="getProgressBg(comp, 'distance')"
                                                    :model-value="getProgressValue(comp, 'distance')"
                                                    rounded
                                                ></v-progress-linear>
                                            </div>
                                            <div class="mt-1">
                                                <v-progress-linear class="mb-2" v-if="comp.alertTime" :color="getProgressColor(comp)" :bg-color="getProgressBg(comp, 'time')" :model-value="getProgressValue(comp, 'time')" rounded></v-progress-linear>
                                                {{ getGearHours(comp.currentTime) }} {{ mdAndUp ? "hours" : "h" }}
                                                <span class="float-right" v-if="comp.alertTime">{{ getGearHours(comp.alertTime) }} {{ mdAndUp ? "hours" : "h" }}</span>
                                                <span class="float-right" v-else>-</span>
                                            </div>
                                            <div class="mt-3">
                                                <div class="float-right">
                                                    <v-switch class="pa-0 ma-0 mr-n1" :model-value="!comp.disabled" @update:model-value="setComponentState(comp)" color="primary"></v-switch>
                                                </div>
                                                <v-btn color="primary" :title="'Reset ' + comp.name + ' to 0 km / hours'" @click.stop="showResetDialog(comp)" :disabled="!canReset(comp)" v-if="!isNew" variant="outlined" size="small" rounded>
                                                    <v-icon start>mdi-refresh</v-icon>
                                                    Reset
                                                </v-btn>
                                            </div>
                                        </v-col>
                                    </v-row>
                                </v-card-text>
                            </v-card>
                        </v-col>
                        <v-col cols="12" sm="12" md="6" key="new">
                            <v-card @click="showComponentDialog({})" variant="outlined">
                                <v-card-title class="bg-accent">
                                    <a title="Add new component">
                                        <v-icon color="primary" class="mt-n1">mdi-plus-circle</v-icon>
                                        <span class="text-primary">Add new component</span>
                                    </a>
                                </v-card-title>
                                <v-card-text class="pa-4 pt-8">
                                    <v-skeleton-loader type="text" :boilerplate="true" />
                                </v-card-text>
                            </v-card>
                        </v-col>
                    </v-row>
                </template>

                <div v-else>
                    <p>You haven't registered components for this gear yet. Want to kickstart with the defaults?</p>
                    <ul class="pl-4 mb-4">
                        <li v-for="comp in defaultComponents" :key="comp.name">{{ comp.name }}: alert every {{ comp.alertDistance }} {{ distanceUnits }}</li>
                    </ul>
                    <v-btn color="primary" title="Start with the default components" @click="createDefaults" rounded>
                        <v-icon start>mdi-text-box-check</v-icon>
                        Use defaults
                    </v-btn>
                </div>
            </div>

            <div class="text-center text-md-left mt-8 mb-8">
                <v-btn color="primary" title="Save this configuration" :disabled="!isConfigValid() || overMaxGearWear" @click="saveConfig" rounded>
                    <v-icon start>mdi-content-save</v-icon>
                    Save configuration
                </v-btn>
                <br v-if="!mdAndUp" />
                <v-btn color="removal" title="Delete this configuration" class="mt-4 mt-md-0 ml-md-2" v-if="!isNew" :disabled="!isConfigValid()" @click.stop="showDeleteGearWearDialog" rounded variant="outlined">
                    <v-icon start>mdi-delete</v-icon>
                    Delete configuration
                </v-btn>
            </div>

            <v-card class="mt-4" v-if="gearwearHistory?.length > 0" variant="outlined">
                <v-card-title class="bg-accent">
                    <span>History</span>
                </v-card-title>
                <v-card-text class="pa-0">
                    <v-table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="data in gearwearHistory" :key="data.date">
                                <td class="pt-2 pb-2">{{ $dayjs(data.date).format(mdAndUp ? "LL" : "l") }}</td>
                                <td class="pt-2 pb-2">
                                    <div v-for="h in data.history" :key="h.message">
                                        {{ h.message }}
                                        <template v-if="h.activities">
                                            <span class="inline-text-separator" v-for="a in h.activities" :key="a">
                                                <a target="strava" :href="'https://www.strava.com/activities/' + a">{{ a }}</a>
                                            </span>
                                        </template>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </v-table>
                </v-card-text>
            </v-card>

            <gearwear-past-usage-panel :gearwear-config="gearwearConfig" :is-new="isNew" v-if="gearwearConfig?.components.length > 0" />

            <v-dialog v-model="componentDialog" width="540" opacity="0.95" :fullscreen="smAndDown">
                <gearwear-edit-component :gearwear-config="gearwearConfig" :component="gearwearComponent" @closed="closedComponentDialog" />
            </v-dialog>

            <v-dialog v-model="resetDialog" width="440" opacity="0.95">
                <v-card>
                    <v-toolbar color="primary">
                        <v-toolbar-title>Reset: {{ gearwearComponent.name }}</v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-toolbar-items>
                            <v-btn icon="mdi-close" @click.stop="hideResetDialog"></v-btn>
                        </v-toolbar-items>
                    </v-toolbar>
                    <v-card-text>
                        <p class="mt-4">Confirm tracking reset for "{{ gearwearComponent.name }}"?</p>
                        <p>Current usage: {{ gearwearComponent.currentDistance }} {{ distanceUnits }}, {{ getGearHours(gearwearComponent.currentTime) }} {{ mdAndUp ? "hours" : "h" }}</p>
                        <p>You should do this right after you have replaced the component with a new one.</p>
                        <div class="text-right">
                            <v-spacer></v-spacer>
                            <v-btn class="mr-2" color="grey" title="Keep current tracking" @click.stop="hideResetDialog" variant="text" rounded>
                                <v-icon start>mdi-cancel</v-icon>
                                Cancel
                            </v-btn>
                            <v-btn color="primary" title="Confirm and reset tracking" @click="resetTracking" rounded>
                                <v-icon start>mdi-refresh</v-icon>
                                Reset
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </v-dialog>

            <v-dialog v-model="deleteComponentDialog" width="440" opacity="0.95">
                <v-card>
                    <v-toolbar color="removal">
                        <v-toolbar-title>Delete: {{ gearwearComponent.name }}</v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-toolbar-items>
                            <v-btn icon="mdi-close" @click.stop="hideDeleteComponentDialog"></v-btn>
                        </v-toolbar-items>
                    </v-toolbar>
                    <v-card-text>
                        <h3 class="mt-4">{{ gearwearComponent.name }} with {{ gearwearComponent.currentDistance }} {{ distanceUnits }}</h3>
                        <p class="mt-2">Sure you want to delete this component?</p>
                        <div class="text-right">
                            <v-spacer></v-spacer>
                            <v-btn class="mr-2" color="grey" title="Cancel deletion" @click.stop="hideDeleteComponentDialog" variant="text" rounded>
                                <v-icon start>mdi-cancel</v-icon>
                                Cancel
                            </v-btn>
                            <v-btn color="removal" title="Confirm and delete component" @click="deleteComponent" rounded>
                                <v-icon start>mdi-check</v-icon>
                                Delete
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </v-dialog>

            <v-dialog v-model="deleteGearWearDialog" width="440" opacity="0.95">
                <v-card>
                    <v-toolbar color="removal">
                        <v-toolbar-title>Delete gear configuration</v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-toolbar-items>
                            <v-btn icon="mdi-close" @click.stop="hideDeleteGearWearDialog"></v-btn>
                        </v-toolbar-items>
                    </v-toolbar>
                    <v-card-text>
                        <h3 class="mt-4">{{ gear.name }}</h3>
                        <p class="mt-2">Sure you want to delete this gear configuration?</p>
                        <div class="text-right">
                            <v-spacer></v-spacer>
                            <v-btn class="mr-2" color="grey" title="Cancel deletion" @click.stop="hideDeleteGearWearDialog" variant="text" rounded>
                                <v-icon start>mdi-cancel</v-icon>
                                Cancel
                            </v-btn>
                            <v-btn color="removal" title="Confirm and delete this gear" @click="deleteGearWear" rounded>
                                <v-icon start>mdi-check</v-icon>
                                Delete
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </v-dialog>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

const historyDateFormat = "YYYY-MM-DD"

useHead({title: "Gear Configuration"})

const api = useApi()
const route = useRoute()
const store = useMainStore()
const webError = useWebError()
const {mdAndUp, smAndDown} = useDisplay()
const {user, distanceUnits} = useUser()
const {getGearType, getGearIcon, getGearHours, getComponentIcon} = useGearwear()
const {$dayjs}: any = useNuxtApp()

const gearId = route.query.id as string
const imperial = user.value.profile.units == "imperial"
let initialGear = _.find(user.value.profile.bikes, {id: gearId}) || _.find(user.value.profile.shoes, {id: gearId})
let initialDefaultComponents: any[] = []

if (initialGear) {
    if (getGearType(initialGear) == "Bike") {
        initialDefaultComponents = [
            {name: "Chain", currentDistance: 0, currentTime: 0, alertDistance: imperial ? 2200 : 3500, alertTime: 0},
            {name: "Cassette", currentDistance: 0, currentTime: 0, alertDistance: imperial ? 6600 : 10500, alertTime: 0},
            {name: "Rear tire", currentDistance: 0, currentTime: 0, alertDistance: imperial ? 3700 : 6000, alertTime: 0},
            {name: "Front tire", currentDistance: 0, currentTime: 0, alertDistance: imperial ? 3700 : 6000, alertTime: 0},
            {name: "Brake pads", currentDistance: 0, currentTime: 0, alertDistance: imperial ? 5500 : 9000, alertTime: 0}
        ]
    } else {
        initialDefaultComponents = [{name: "Shoes", currentDistance: 0, currentTime: 0, alertDistance: imperial ? 500 : 800, alertTime: 0}]
    }
}

const defaultComponents = ref(initialDefaultComponents)
const isLoading = ref(true)
const invalidGear = ref(!initialGear)
const gear = ref<any>(initialGear)
const gearwearConfig = ref<any>({components: []})
const gearwearComponent = ref<any>({})
const gearwearHistory = ref<any[]>(null)
const isNew = ref(false)
const hasChanges = ref(false)
const componentDialog = ref(false)
const resetDialog = ref(false)
const deleteComponentDialog = ref(false)
const deleteGearWearDialog = ref(false)

const overMaxGearWear = computed(() => {
    if (!user.value) return false
    return !user.value.isPro && !gearwearConfig.value && store.gearwear.length >= store.freePlanDetails.maxGearWearCount
})
const hasBrandModel = computed(() => gear.value.brand || gear.value.model)

/**
 * Load the gear details and current GearWear configuration.
 */
const loadData = async () => {
    try {
        if (!route.query || !route.query.id) {
            return webError("GearEdit.fetch", {status: 404, message: "Missing gear ID on the URL"})
        }

        const gearDetails: any = await api(`/api/gearwear/${user.value.id}/${route.query.id}`)
        const config = gearDetails.config

        if (!gearDetails.gear) {
            invalidGear.value = true
            return
        }

        gear.value = gearDetails.gear

        if (config?.components) {
            gearwearConfig.value = config
            isNew.value = false
        } else {
            gearwearConfig.value = {components: []}
            isNew.value = true
        }

        if (gearwearConfig.value.components.length > 0) {
            for (const comp of config.components) {
                if (comp.history && comp.history.length > 0) {
                    comp.lastResetDate = $dayjs(comp.history[comp.history.length - 1].date).format(historyDateFormat)
                }
            }
        }

        if (!isNew.value) {
            buildHistory()
        }

        if (route.query.reset) {
            const component: any = _.find(gearwearConfig.value.components, {name: route.query.reset})

            if (component && !component.history.find((h: any) => $dayjs(h.date).format(historyDateFormat) == $dayjs().format(historyDateFormat))) {
                showResetDialog(component)
            }
        } else if (route.query.comp) {
            const component = _.find(gearwearConfig.value.components, {name: route.query.comp})

            if (component) {
                showComponentDialog(component)
            }
        }
    } catch (ex) {
        webError("GearEdit.fetch", ex)
    }

    isLoading.value = false
}

onBeforeRouteLeave((to, from, next) => {
    if (hasChanges.value) {
        const answer = window.confirm("You have unsaved changes on this gear config. Sure you want to leave?")

        if (answer) {
            next()
        } else {
            next(false)
        }
    } else {
        next()
    }
})

/**
 * Save the GearWear configuration.
 */
const saveConfig = async () => {
    try {
        hasChanges.value = false

        if (gearwearConfig.value.components.length == 0) {
            await navigateTo({path: "/gear"})
            return
        }

        for (const comp of gearwearConfig.value.components) {
            delete comp.lastResetDate
        }

        await api(`/api/gearwear/${user.value.id}/${gear.value.id}`, {method: "POST", body: {components: gearwearConfig.value.components}})

        if (isNew.value) {
            await navigateTo({path: "/gear", query: {new: gear.value.id}})
        } else {
            await navigateTo({path: "/gear"})
        }
    } catch (ex) {
        webError("GearEdit.saveConfig", ex)
    }
}

const createDefaults = () => {
    gearwearConfig.value = {
        id: gear.value.id,
        components: _.cloneDeep(defaultComponents.value)
    }

    hasChanges.value = true
}

const getProgressValue = (component: any, alertType: string) => {
    const current = alertType == "distance" ? component.currentDistance : component.currentTime
    const alert = alertType == "distance" ? component.alertDistance : component.alertTime
    const percent = (current / alert) * 100
    if (percent > 100) return 200 - percent
    return percent
}

const getProgressBg = (component: any, alertType: string) => {
    if (component.disabled) return "transparent"
    const current = alertType == "distance" ? component.currentDistance : component.currentTime
    const alert = alertType == "distance" ? component.alertDistance : component.alertTime
    if (current / alert >= 1) return "error"
    return "accent"
}

const getProgressColor = (component: any) => {
    if (component.disabled) return "accent"
    return "secondary"
}

const canReset = (component: any) => component.currentDistance > 0 || component.currentTime > 0
const isConfigValid = () => gearwearConfig.value?.components.length > 0

/**
 * Build the component history table.
 */
const buildHistory = () => {
    const dateHistory: Record<string, any[]> = {}

    if (gearwearConfig.value.lastUpdate) {
        const hDate = $dayjs(gearwearConfig.value.lastUpdate.date).format(historyDateFormat)
        dateHistory[hDate] = [{message: "Last activity: ", activities: gearwearConfig.value.lastUpdate.activities}]
    }

    for (const c of gearwearConfig.value.components) {
        if (c.history?.length > 0) {
            for (const h of c.history) {
                const hDate = $dayjs(h.date).format(historyDateFormat)
                if (!dateHistory[hDate]) {
                    dateHistory[hDate] = []
                }
                dateHistory[hDate].push({message: `${c.name} replaced (${h.distance}${distanceUnits.value})`, reset: true})
            }
        }

        if (c.dateAlertSent) {
            const hDate = $dayjs(c.dateAlertSent).format(historyDateFormat)
            if (!dateHistory[hDate]) {
                dateHistory[hDate] = []
            }
            dateHistory[hDate].push({message: `Alert sent for ${c.name}`, alert: true})
        }
    }

    const entries = Object.entries(dateHistory)
    const history = entries.map(([date, history]) => ({date: date, history: history}))
    gearwearHistory.value = _.orderBy(history, "date", "desc")
}

const setComponentState = (component: any) => {
    component.disabled = component.disabled ? false : true
    hasChanges.value = true
}

const showComponentDialog = (component: any) => {
    gearwearComponent.value = component
    deleteComponentDialog.value = false
    componentDialog.value = true
}

const closedComponentDialog = (component: any, changes: string[] = []) => {
    hasChanges.value = true

    if (component == "delete") {
        showDeleteComponentDialog(gearwearComponent.value)
        return
    }
    if (component) {
        if (!gearwearConfig.value.id) {
            gearwearConfig.value.id = gear.value.id
        }
        if (gearwearComponent.value.name) {
            _.assign(gearwearComponent.value, component)

            const wasNotResetToday = !isNew.value && component.lastResetDate != $dayjs().format("YYYY-MM-DD")
            if (changes.length > 0 && wasNotResetToday && component.currentDistance < 1 && component.currentTime < 3600) {
                componentDialog.value = false
                resetDialog.value = true
                return
            }
        } else {
            gearwearConfig.value.components.push(component)
        }
    }

    gearwearComponent.value = {}
    componentDialog.value = false
}

const showResetDialog = (component: any) => {
    gearwearComponent.value = component
    componentDialog.value = false
    resetDialog.value = true
}

const hideResetDialog = () => {
    resetDialog.value = false
}

/**
 * Reset tracking for the selected component.
 */
const resetTracking = async () => {
    try {
        await api(`/api/gearwear/${user.value.id}/${gear.value.id}`, {method: "POST", body: {resetTracking: gearwearComponent.value.name}})

        if (!gearwearComponent.value.history) {
            gearwearComponent.value.history = []
        }

        const currentDistance = gearwearComponent.value.currentDistance
        const currentTime = gearwearComponent.value.currentTime

        gearwearComponent.value.history.push({date: new Date(), distance: currentDistance, time: currentTime})
        buildHistory()

        gearwearComponent.value.currentDistance = 0
        gearwearComponent.value.currentTime = 0
        gearwearComponent.value.dateAlertSent = null
        gearwearComponent.value.lastResetDate = $dayjs().format("YYYY-MM-DD")
        gearwearComponent.value = {}
    } catch (ex) {
        webError("GearEdit.resetTracking", ex)
    }

    resetDialog.value = false
}

const showDeleteComponentDialog = (component: any) => {
    gearwearComponent.value = component
    componentDialog.value = false
    deleteComponentDialog.value = true
}

const hideDeleteComponentDialog = () => {
    deleteComponentDialog.value = false
}

const deleteComponent = async () => {
    try {
        _.remove(gearwearConfig.value.components, (c: any) => c == gearwearComponent.value)
        gearwearConfig.value.components = gearwearConfig.value.components
    } catch (ex) {
        webError("GearEdit.deleteComponent", ex)
    }

    deleteComponentDialog.value = false
    hasChanges.value = true
}

const showDeleteGearWearDialog = () => {
    deleteGearWearDialog.value = true
}

const hideDeleteGearWearDialog = () => {
    deleteGearWearDialog.value = false
}

/**
 * Delete the GearWear configuration.
 */
const deleteGearWear = async () => {
    try {
        await api(`/api/gearwear/${user.value.id}/${gear.value.id}`, {method: "DELETE"})
        hasChanges.value = false

        await navigateTo({path: "/gear", query: {deleted: gear.value.id}})
    } catch (ex) {
        webError("GearEdit.deleteGearWear", ex)
    }
}

/**
 * Re-enable a disabled GearWear configuration.
 */
const reenableGear = async () => {
    try {
        await api(`/api/gearwear/${user.value.id}/${gear.value.id}`, {method: "POST", body: {disabled: false}})
        gearwearConfig.value.disabled = false
    } catch (ex) {
        webError("GearEdit.deleteGearWear", ex)
    }
}

onMounted(loadData)
</script>
