<template>
    <div>
        <v-container fluid>
            <h1>My Gear</h1>
            <template v-if="!isLoading && gearWithConfig.length == 0">
                <p>With GearWear you can set up automated alerts for your expendable parts when they reach the target usage (distance or hours). To start, please create specific GearWear to your desired bikes and/or shoes below.</p>
            </template>
            <template v-if="!isLoading && noGear">
                <v-alert class="text-center text-md-left">
                    You don't have bikes or shoes registered on your Strava account. Please register them there first, and then refresh this page.
                    <div class="mt-4">
                        <a href="https://www.strava.com/settings/gear" target="strava">
                            <v-btn color="primary" title="Manage my gear on Strava" rounded>
                                <v-icon start>mdi-open-in-new</v-icon>
                                Manage gear on Strava
                            </v-btn>
                        </a>
                    </div>
                </v-alert>
            </template>
            <template v-else>
                <v-alert class="text-center text-md-left" v-if="!user.email">
                    <p>To get GearWear distance alerts, Strautomator needs to know your email address first.</p>
                    <v-btn color="primary" title="Set your email address now" @click="emailDialog = true" rounded size="small">Set my email address</v-btn>
                    <account-email-dialog :show-dialog="emailDialog" @closed="hideEmailDialog" />
                </v-alert>
                <div class="mt-5 mb-2" v-if="isLoading">
                    <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                    Loading bikes and shoes...
                </div>
                <template v-else>
                    <div v-for="gear in gearWithConfig" :key="gear.id">
                        <gearwear-gear-card :gear="gear" :gearwear-config="gearwearConfigs[gear.id]" />
                    </div>

                    <div v-if="batteryTracker?.devices?.length > 0">
                        <v-card class="mb-5" variant="outlined">
                            <v-card-title class="bg-accent">
                                <v-icon class="ml-n1 mr-2">mdi-battery-charging-medium</v-icon>
                                <span>Device batteries</span>
                            </v-card-title>
                            <v-card-text class="pa-0 text-white">
                                <v-table class="mt-2">
                                    <tbody>
                                        <tr v-for="device in batteryTracker.devices" :key="device.id">
                                            <td class="pr-0 pl-4">
                                                <v-hover v-slot="{isHovering, props: hoverProps}">
                                                    <a v-bind="hoverProps" title="Rename this device" @click="showFitDeviceNameDialog(device.id)">
                                                        {{ getFitDeviceName(device.id) || getDeviceIdName(device.id) }}
                                                        <v-icon class="ml-1" v-show="isHovering" size="small">mdi-pencil-outline</v-icon>
                                                    </a>
                                                </v-hover>
                                            </td>
                                            <td class="text-right">
                                                <v-chip class="text-uppercase" :color="getBatteryColor(device)" size="small">{{ device.status }}</v-chip>
                                            </td>
                                            <td width="1" class="nowrap pl-0 text-right">{{ $dayjs(device.dateUpdated).format(mdAndUp ? "lll" : "ll") }}</td>
                                        </tr>
                                    </tbody>
                                </v-table>
                                <gearwear-fit-device-name-dialog :device-id="fitDeviceId" :device-name="fitDeviceName" :show-dialog="fitDeviceNameDialog" @closed="hideFitDeviceNameDialog" />
                            </v-card-text>
                        </v-card>
                    </div>

                    <v-card class="mt-2" v-if="gearWithoutConfig.length > 0" variant="outlined">
                        <v-card-title>
                            <span>{{ gearWithConfig.length > 0 ? "Gear with no configuration" : "Your Strava gear" }}</span>
                        </v-card-title>
                        <v-card-text class="pa-0 text-white">
                            <v-table>
                                <tbody>
                                    <tr v-for="gear in gearWithoutConfig" :key="gear.id">
                                        <td class="pl-0 pr-0">
                                            <v-btn color="primary" :to="'/gear/edit?id=' + gear.id" :title="`Create GearWear for ${gear.name}`" :disabled="gearwearRemaining < 1" variant="text" rounded size="small">
                                                <v-icon class="mr-2">mdi-plus-circle</v-icon>
                                                <v-icon class="mr-2" size="small">{{ getGearIcon(gear) }}</v-icon>
                                                {{ gear.name }}
                                            </v-btn>
                                        </td>
                                        <td v-if="mdAndUp">
                                            <v-chip class="text-lowercase" v-if="gear.primary" variant="outlined" size="small">Primary {{ getGearType(gear) }}</v-chip>
                                        </td>
                                        <td class="pl-0 text-right">{{ gear.distance }} {{ distanceUnits }}</td>
                                    </tr>
                                </tbody>
                            </v-table>
                            <div class="mt-4 mb-4 ml-md-4 text-center text-md-left">
                                <v-btn color="primary" href="https://www.strava.com/settings/gear" target="strava" title="Manage my gear on Strava" size="small" rounded>
                                    <v-icon start>mdi-open-in-new</v-icon>
                                    Manage gear on Strava
                                </v-btn>
                            </div>
                        </v-card-text>
                    </v-card>
                    <v-alert class="mt-5 text-center text-md-left" border="top" v-if="!user.isPro" border-color="primary">
                        <p v-if="gearwearRemaining == 0">
                            You have reached the limit of {{ store.freePlanDetails.maxGearWear }}
                            GearWear configurations on your free account.
                            <br v-if="mdAndUp" />
                            To use this feature with more bikes or shoes you'll need a PRO account.
                        </p>
                        <p>Want instant usage updates and additional tracking of your connected Garmin and Wahoo sensor batteries as well?</p>
                        <v-btn color="primary" to="/billing" title="Subscribe to get a PRO account!" rounded>
                            <v-icon start>mdi-credit-card</v-icon>
                            Subscribe to PRO
                        </v-btn>
                    </v-alert>
                    <v-alert class="mt-5 text-center text-md-left" v-else-if="!batteryTracker && !user.preferences.privacyMode">
                        <div class="mt-2 mt-md-0" v-if="user.isPro && !noGear">
                            Want to keep track of your connected sensor batteries as well?
                            <br />
                            Simply link your <nuxt-link to="/account?garmin=link" title="Link your Garmin account">Garmin</nuxt-link> or <nuxt-link to="/account?wahoo=link" title="Link your Wahoo account">Wahoo</nuxt-link>
                            account, and you'll see a list of all your device sensors here.
                        </div>
                    </v-alert>
                    <v-alert class="mt-4 text-center text-md-left text-caption" v-if="!noGear">
                        <template v-if="user.isPro">
                            Gear tracking happens instantly for the vast majority of activities processed by Strautomator PRO, but can have a delay of up to {{ delayDays == 1 ? "1 day" : `${delayDays} days` }} to get triggered.
                            <br v-if="mdAndUp" />
                            You can change this setting on your <nuxt-link to="/account" title="My account">account preferences</nuxt-link>.
                        </template>
                        <template v-else>
                            Gear tracking happens with a {{ delayDays == 1 ? "1 day" : `${delayDays} days` }} delay, so you have plenty of time to set the correct bike or shoes on your recent activities.
                            <br v-if="mdAndUp" />
                            You can change the delay on your
                            <nuxt-link to="/account" title="My account">account preferences</nuxt-link>.
                            <div class="mt-1">Today's activities will be processed on {{ trackingDay }}.</div>
                        </template>
                    </v-alert>
                </template>

                <v-alert class="mt-5 text-center text-md-left" border="top" v-if="gearwearRemaining < 0" border-color="error">
                    <p>
                        You are over the limit of {{ store.freePlanDetails.maxGearWear }}
                        GearWear configurations on your free account.
                        <br v-if="mdAndUp" />
                        Please upgrade your account, or remove the exceeding configurations to keep a maximum of {{ store.freePlanDetails.maxGearWear }}, as some might not be updated.
                    </p>
                    <v-btn color="primary" to="/billing" title="Subscribe to get a PRO account!" rounded>
                        <v-icon start>mdi-credit-card</v-icon>
                        Subscribe to PRO
                    </v-btn>
                </v-alert>
            </template>
        </v-container>
        <v-snackbar v-model="alertEmailSaved" class="text-left" color="success" :timeout="5000" rounded location="bottom">
            Your email was set to {{ store.user.email }}!
            <template #actions>
                <v-icon @click="closeAlert">mdi-close-circle</v-icon>
            </template>
        </v-snackbar>
        <v-snackbar v-model="alertFitDevice" class="text-left" :color="fitDeviceDialogAction" :timeout="5000" rounded location="bottom">
            {{ fitDeviceDialogAction == "success" ? `Device ${fitDeviceId} saved.` : `Device ${fitDeviceId} removed.` }}
            <template #actions>
                <v-icon @click="closeAlert">mdi-close-circle</v-icon>
            </template>
        </v-snackbar>
        <v-snackbar v-if="route.query.new" v-model="alertNew" class="text-left" color="success" :timeout="5000" rounded location="bottom">
            GearWear configuration for "{{ alertGearTitle }}" created!
            <template #actions>
                <v-icon @click="closeAlert">mdi-close-circle</v-icon>
            </template>
        </v-snackbar>
        <v-snackbar v-if="route.query.deleted" v-model="alertDeleted" class="text-left" color="error" :timeout="5000" rounded location="bottom">
            GearWear configuration for "{{ alertGearTitle }}" deleted!
            <template #actions>
                <v-icon @click="closeAlert">mdi-close-circle</v-icon>
            </template>
        </v-snackbar>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

useHead({title: "Gear"})

const api = useApi()
const route = useRoute()
const store = useMainStore()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user, distanceUnits, getGearwearRemaining} = useUser()
const {getGearType, getGearIcon, getDeviceIdName, getFitDeviceName} = useGearwear()
const {$dayjs}: any = useNuxtApp()

const delayDays = user.value.preferences.gearwearDelayDays || 2
const isLoading = ref(true)
const emailDialog = ref(false)
const alertEmailSaved = ref(false)
const alertNew = ref(false)
const alertDeleted = ref(false)
const alertFitDevice = ref(false)
const alertGearTitle = ref("")
const gearWithConfig = ref<any[]>([])
const gearWithoutConfig = ref<any[]>([])
const gearwearConfigs = ref<Record<string, any>>({})
const batteryTracker = ref<any>(null)
const fitDeviceId = ref<string>(null)
const fitDeviceName = ref<string>(null)
const fitDeviceNameDialog = ref(false)
const fitDeviceDialogAction = ref("")
const trackingDay = $dayjs().add(delayDays, "days").format("ddd Do")

const gearwearRemaining = computed(() => getGearwearRemaining(gearwearConfigs.value))
const noGear = computed(() => gearWithConfig.value.length == 0 && gearWithoutConfig.value.length == 0)

/**
 * Load GearWear configurations and split Strava gear by config status.
 */
const loadData = async () => {
    try {
        const configs: Record<string, any> = {}
        const query = route.query && route.query.refresh ? {refresh: 1} : undefined

        const result: any = await api(`/api/gearwear/${user.value.id}`, {query})
        for (const config of result.configs) {
            configs[config.id] = config
        }

        gearwearConfigs.value = configs
        store.setGearWear(result.configs)

        const bikes = user.value.profile.bikes || []
        const shoes = user.value.profile.shoes || []
        const gearWith = _.concat(bikes, shoes)
        const gearWithout = _.remove(gearWith, (g: any) => !gearwearConfigs.value[g.id])

        gearWithConfig.value = gearWith
        gearWithoutConfig.value = gearWithout

        if (result.batteryTracker) {
            batteryTracker.value = result.batteryTracker
        }
    } catch (ex) {
        webError("Gear.fetch", ex)
    }

    isLoading.value = false
}

const hideEmailDialog = (saved: boolean) => {
    emailDialog.value = false
    alertEmailSaved.value = saved
}

const showFitDeviceNameDialog = (id: string) => {
    fitDeviceId.value = id
    fitDeviceName.value = getFitDeviceName(id)
    fitDeviceNameDialog.value = true
}

const hideFitDeviceNameDialog = (action: string) => {
    if (action == "removal") {
        batteryTracker.value.devices = batteryTracker.value.devices.filter((d: any) => d.id != fitDeviceId.value)
        batteryTracker.value = batteryTracker.value
    }

    fitDeviceNameDialog.value = false
    fitDeviceDialogAction.value = action || ""
    alertFitDevice.value = action ? true : false
}

/**
 * Get a gear name by ID.
 */
const getGearName = (id: string) => {
    let gear = _.find(user.value.profile.bikes, {id: id})
    if (gear) return gear.name
    gear = _.find(user.value.profile.shoes, {id: id})
    if (gear) return gear.name
    return (id?.substring(0, 1) == "b" ? "Bike" : "Shoes").toLowerCase()
}

const getBatteryColor = (device: any) => {
    if (device.status == "unknown") return "accent"
    if (device.status == "low") return "error"
    if (device.status == "critical") return "removal"
    return "success"
}

const closeAlert = () => {
    alertNew.value = false
    alertDeleted.value = false
    alertFitDevice.value = false
    alertEmailSaved.value = false
}

onMounted(() => {
    loadData()

    if (route.query.new) {
        alertGearTitle.value = getGearName(route.query.new as string)
        alertNew.value = true
    } else if (route.query.deleted) {
        alertGearTitle.value = getGearName(route.query.deleted as string)
        alertDeleted.value = true
    }
})
</script>
