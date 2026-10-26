<template>
    <v-card class="mt-4" variant="outlined">
        <v-card-text class="pb-md-0">
            <h3 v-if="isNew">Don't know the current usage of the components above?</h3>
            <h3 v-else>Lost track of the usage for this gear?</h3>
            <p class="mt-1">Strautomator can calculate it for you! Enter the date when you last swapped the component(s).</p>
            <div class="d-flex text-center text-md-left" :class="{'flex-column': !mdAndUp}">
                <div class="flex-grow-0">
                    <v-menu v-model="dateMenu" :close-on-content-click="false" transition="scale-transition" min-width="290px" location="bottom">
                        <template #activator="{props: menuProps}">
                            <v-text-field v-model="dateSince" v-bind="menuProps" width="248" label="Since date" type="text" prepend-icon="mdi-calendar" :loading="pastLoading" variant="outlined" readonly rounded density="compact"></v-text-field>
                        </template>
                        <v-date-picker v-model="dateSincePicker" :min="dateSinceMin" :max="dateSinceMax" @update:model-value="updateDateSince" hide-header></v-date-picker>
                    </v-menu>
                </div>
                <div class="flex-grow-0">
                    <v-btn color="primary" class="ml-md-2" title="Get distance and hours from Strava activities" @click="getPastUsage" :disabled="pastLoading || !dateSince" rounded>
                        <v-icon start>mdi-calculator</v-icon>
                        Get expected usage
                    </v-btn>
                </div>
            </div>
            <v-alert border="top" color="accent" v-if="!isNew && pastActivities > 0">
                Since {{ formatDateSince }} this gear has been used for {{ pastUsage }}.<br />
                You can manually update the relevant components with these values now.
            </v-alert>
        </v-card-text>

        <v-snackbar v-model="pastUsageAlert" class="text-left" color="success" :timeout="5000" rounded location="bottom">
            <span v-if="pastActivities > 0">Got {{ pastUsage }} for {{ pastActivities }} activities since {{ formatDateSince }}.</span>
            <span v-else>No activities found since {{ formatDateSince }} for that gear.</span>

            <template #actions>
                <v-icon @click="pastUsageAlert = false">mdi-close-circle</v-icon>
            </template>
        </v-snackbar>
    </v-card>
</template>

<script setup lang="ts">
const props = defineProps<{
    gearwearConfig: any
    isNew?: boolean
}>()

const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user, distanceUnits} = useUser()
const {$dayjs}: any = useNuxtApp()

const dateSinceMin = $dayjs().subtract(3, "years").format("YYYY-MM-DD")
const dateSinceMax = $dayjs().format("YYYY-MM-DD")
const dateSince = ref<string>(null)
const dateSincePicker = ref<Date | null>(null)
const dateMenu = ref(false)
const pastActivities = ref(0)
const pastUsage = ref("")
const pastUsageAlert = ref(false)
const pastLoading = ref(false)

const formatDateSince = computed(() => $dayjs(dateSince.value).format("ll"))

/**
 * Convert the picker Date to the YYYY-MM-DD string expected by the API.
 */
const updateDateSince = (value: Date | null) => {
    dateSincePicker.value = value
    dateSince.value = value ? $dayjs(value).format("YYYY-MM-DD") : null
    dateMenu.value = false
}

/**
 * Load and summarize previous activities using this gear since the selected date.
 */
const getPastUsage = async () => {
    try {
        pastLoading.value = true

        const timestamp = $dayjs(dateSince.value).unix()
        const activities: any[] = await api(`/api/strava/${user.value.id}/activities/since/${timestamp}`, {query: {gear: props.gearwearConfig.id}})

        let distance = 0
        let elapsedTime = 0

        for (const a of activities) {
            if (a.distance && a.distance > 0) {
                distance += a.distance
            }
            if (a.movingTime && a.movingTime > 0) {
                elapsedTime += a.movingTime
            } else if (a.totalTime && a.totalTime > 0) {
                elapsedTime += a.totalTime
            }
        }

        distance = Math.round(distance)
        const hours = Math.round(elapsedTime / 3600)

        // Only update if it's a new GearWear config.
        if (props.isNew) {
            if (distance > 0) {
                for (const comp of props.gearwearConfig.components) {
                    comp.currentDistance = distance
                }
            }
            if (hours > 0) {
                for (const comp of props.gearwearConfig.components) {
                    comp.currentTime = elapsedTime
                }
            }
        }

        pastActivities.value = activities.length
        pastUsage.value = `${distance} ${distanceUnits.value} and ${hours} hours`
        pastUsageAlert.value = true
    } catch (ex) {
        webError("GearPastUsagePanel.getPastUsage", ex)
    }

    pastLoading.value = false
}
</script>
