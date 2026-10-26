<template>
    <div>
        <v-container v-if="user" fluid>
            <h1>Calendar Export</h1>
            <v-card class="mt-5" variant="outlined">
                <v-card-text>
                    <p>
                        Strautomator can export your Strava activities, club events and gear component history using the iCal format.<br />
                        Please set your desired options, and then use the generated URL to subscribe.
                    </p>

                    <div>
                        <h3>What to export</h3>
                        <v-radio-group class="mt-1" v-model="calendarType" :inline="mdAndUp">
                            <v-radio label="Everything" value="all"></v-radio>
                            <v-radio label="Only activities" value="activities"></v-radio>
                            <v-radio label="Only club events" value="clubs"></v-radio>
                            <v-radio label="Only gear history" value="gear"></v-radio>
                        </v-radio-group>
                    </div>
                    <div>
                        <h3>Sport types</h3>
                        <v-radio-group class="mt-1" v-model="calendarSports" :inline="mdAndUp">
                            <v-radio label="All sports" value="all"></v-radio>
                            <v-radio label="Rides" value="Ride,MountainBikeRide,EBikeRide,EMountainBikeRide,VirtualRide"></v-radio>
                            <v-radio label="Runs" value="Walk,Run,TrailRun,VirtualRun"></v-radio>
                        </v-radio-group>
                    </div>
                    <div>
                        <h3 class="mb-4">Other options</h3>
                        <v-checkbox class="mt-n4" v-model="excludeCommutes" label="Exclude commutes" v-if="!['clubs', 'gear'].includes(calendarType)" density="compact" color="primary" />
                        <v-checkbox class="mt-n4" v-model="excludeNotJoined" label="Only events I have joined" v-if="!['activities', 'gear'].includes(calendarType)" density="compact" color="primary" />
                        <v-checkbox class="mt-n4" v-model="includeAllCountries" label="Include events outside my country" v-if="!['activities', 'gear'].includes(calendarType)" density="compact" color="primary" />
                        <v-checkbox class="mt-n4" v-model="linkInDescription" label="Add event links on descriptions" density="compact" color="primary" />
                        <v-checkbox class="mt-n4" v-model="compact" label="Compact descriptions" density="compact" color="primary" />
                    </div>
                    <div v-if="['all', 'activities'].includes(calendarType)">
                        <h3>Date range</h3>
                        <v-row class="mt-2" no-gutters>
                            <v-col cols="5" md="2">
                                <v-text-field v-model="daysFrom" label="Past" class="ml-n1" type="number" suffix="days" min="1" :max="maxDaysFrom" hide-details variant="outlined" rounded density="compact"></v-text-field>
                            </v-col>
                            <v-col cols="5" class="ml-1 mt-3 text-caption text-error" v-if="daysFrom > maxDaysFrom">max {{ maxDaysFrom }}</v-col>
                        </v-row>
                        <v-row class="mt-3" no-gutters>
                            <v-col cols="5" md="2">
                                <v-text-field v-model="daysTo" label="Future" class="ml-n1" type="number" suffix="days" min="1" :max="maxDaysTo" hide-details variant="outlined" rounded density="compact"></v-text-field>
                            </v-col>
                            <v-col cols="5" class="ml-1 mt-3 text-caption text-error" v-if="daysTo > maxDaysTo">max {{ maxDaysTo }}</v-col>
                        </v-row>
                    </div>

                    <div class="text-center text-md-left mt-5">
                        <v-btn color="primary" title="Subscribe to your Strava activities calendar" :href="'webcal://' + urlCalendar" rounded>
                            <v-icon start>mdi-calendar-check</v-icon>
                            Subscribe to calendar
                        </v-btn>
                        <br v-if="!mdAndUp" />
                        <v-btn color="primary" class="ml-md-2 mt-3 mt-md-0" title="Want to generate a new calendar URL?" @click.stop="showResetDialog" :disabled="!!newUrlToken" variant="outlined" rounded>
                            <v-icon start>mdi-reload-alert</v-icon>
                            Reset URL token
                        </v-btn>
                        <div class="mt-3">
                            <v-text-field @focus="selectTarget" :model-value="'https://' + urlCalendar" hide-details readonly density="compact" variant="outlined" rounded></v-text-field>
                        </div>
                        <v-alert v-if="newUrlToken" class="mt-2" color="success" icon="mdi-arrow-up-bold" rounded density="compact">
                            <div class="text-center text-md-left">New token generated, calendar URL updated!</div>
                        </v-alert>
                    </div>
                </v-card-text>
            </v-card>
            <v-alert v-if="user && !user.isPro" border="top" border-color="primary" class="mt-4">
                <div class="mt-1 text-center text-md-left">
                    Free accounts are limited to activities from the past {{ store.freePlanDetails.pastCalendarDays }} and club events for the next {{ store.freePlanDetails.futureCalendarDays }} days, using the default template.
                    <br v-if="!mdAndUp" />
                    <nuxt-link to="/billing" title="Upgrade to PRO!">Upgrade to PRO</nuxt-link>
                    to export activities from the past {{ store.proPlanDetails.pastCalendarDays }} and club events for the next {{ store.proPlanDetails.futureCalendarDays }} days.
                </div>
            </v-alert>
            <v-card v-if="user && user.isPro" class="mt-5" variant="outlined">
                <v-card-title class="bg-accent">Activity template</v-card-title>
                <v-card-text>
                    <p class="mt-4">As a PRO user, you can customize the details of your activities on exported calendars.</p>
                    <div>
                        <v-text-field ref="eventSummaryInput" label="Event summary" v-model="calendarTemplate.eventSummary" @focus="setActiveField('eventSummary')" hide-details density="compact" variant="outlined" rounded></v-text-field>
                    </div>
                    <div>
                        <tag-autocomplete
                            ref="eventDetailsInput"
                            class="mt-3"
                            label="Event details"
                            v-model="calendarTemplate.eventDetails"
                            :items="activityTags"
                            textarea
                            height="160"
                            maxlength="255"
                            @focus="setActiveField('eventDetails')"
                            hide-details
                            density="compact"
                            variant="outlined"
                            rounded
                            no-resize
                        >
                            <template #item="{item}">
                                <v-list-item-title>{{ item.value.substring(1, item.value.length - 1) }}</v-list-item-title>
                                <v-list-item-subtitle>{{ item.label }}</v-list-item-subtitle>
                            </template>
                        </tag-autocomplete>
                    </div>
                    <div class="mt-2 text-center text-md-left">
                        <v-btn color="primary" title="Save your custom calendar template" :variant="!changedTemplate ? 'outlined' : undefined" :disabled="!changedTemplate" @click="saveTemplate" rounded>
                            <v-icon start>mdi-content-save</v-icon>
                            Save
                        </v-btn>
                        <v-btn class="ml-2" color="accent" title="Save your custom calendar template" @click="setSampleTemplate" rounded>
                            <v-icon start>mdi-text-box-outline</v-icon>
                            Sample
                        </v-btn>
                    </div>
                    <v-alert v-model="templateWarning" color="secondary" class="mt-4" icon="mdi-alert" rounded variant="outlined" density="compact"
                        >The new template will be applied once your calendar gets refreshed with new activities from Strava.</v-alert
                    >
                </v-card-text>
            </v-card>
            <v-card class="mt-5" variant="outlined">
                <v-card-title class="bg-accent"> Need help? </v-card-title>
                <v-card-text>
                    <p class="mt-3">
                        Subscribing to .ics calendars should be fairly simple, but the steps are slightly different depending on which service or client you use. For help, please check
                        <a class="font-weight-medium" href="https://www.webcal.guru/en-GB/help?question_id=subscribe" target="helpOthers">WebCal.Guru</a> or...
                    </p>
                    <ul class="pl-4">
                        <li>
                            <a class="font-weight-medium" href="https://support.google.com/calendar/answer/37100?hl=en" target="helpGoogle">Google</a>
                        </li>
                        <li>
                            <a class="font-weight-medium" href="https://help.yahoo.com/kb/unfollow-calendars-yahoo-mail-sln28066.html" target="helpYahoo">Yahoo Mail</a>
                        </li>
                        <li>
                            <a class="font-weight-medium" href="https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar-in-outlook-on-the-web-503ffaf6-7b86-44fe-8dd6-8099d95f38df" target="helpOutlook">Outlook</a>
                        </li>
                        <li>
                            <a class="font-weight-medium" href="https://support.apple.com/en-gb/guide/calendar/icl1022/mac" target="helpMac">Mac OS</a>
                        </li>
                        <li>
                            <a class="font-weight-medium" href="https://support.apple.com/en-gb/guide/iphone/iph3d1110d4/ios" target="helpiOS">iOS</a>
                        </li>
                    </ul>
                </v-card-text>
            </v-card>

            <v-dialog v-model="resetDialog" width="440" opacity="0.95">
                <v-card>
                    <v-toolbar color="primary">
                        <v-toolbar-title>Reset URL token</v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-toolbar-items>
                            <v-btn icon="mdi-close" @click.stop="hideResetDialog"></v-btn>
                        </v-toolbar-items>
                    </v-toolbar>
                    <v-card-text>
                        <p class="mt-2">Are you sure you want to reset your URL token? Your calendar will get a new URL, and previously imported calendars will be invalidated.</p>
                        <div class="text-right">
                            <v-spacer></v-spacer>
                            <v-btn class="mr-2" color="grey" title="Cancel and do not reset" @click.stop="hideResetDialog" variant="text" rounded>
                                <v-icon start>mdi-cancel</v-icon>
                                Cancel
                            </v-btn>
                            <v-btn color="primary" title="Confirm and reset the URL" @click="resetUrl" rounded>
                                <v-icon start>mdi-check</v-icon>
                                Reset
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </v-dialog>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Calendar"})

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()
const {mainActivityTags} = useRecipe()

const currentUser = store.user
const storedTemplate = currentUser.preferences.calendarTemplate || {}
const freePlan = store.freePlanDetails
const proPlan = store.proPlanDetails
const defaultDaysFrom = currentUser.isPro ? Math.round(proPlan.pastCalendarDays / 365 / 2) * 365 : freePlan.pastCalendarDays
const defaultDaysTo = currentUser.isPro ? Math.round(proPlan.futureCalendarDays / 180 / 2) * 180 : freePlan.futureCalendarDays

const calendarType = ref("all")
const calendarSports = ref("all")
const locationRef = ref<Location | null>(null)
const excludeCommutes = ref(false)
const excludeNotJoined = ref(false)
const includeAllCountries = ref(false)
const linkInDescription = ref(false)
const compact = ref(false)
const templateWarning = ref(false)
const activeField = ref("eventDetails")
const daysFrom = ref(defaultDaysFrom)
const daysTo = ref(defaultDaysTo)
const maxDaysFrom = currentUser.isPro ? proPlan.pastCalendarDays : freePlan.pastCalendarDays
const maxDaysTo = currentUser.isPro ? proPlan.futureCalendarDays : freePlan.futureCalendarDays
const currentEventSummary = ref(storedTemplate.eventSummary || "")
const currentEventDetails = ref(storedTemplate.eventDetails || "")
const calendarTemplate = reactive({
    eventSummary: storedTemplate.eventSummary || "",
    eventDetails: storedTemplate.eventDetails || ""
})
const sampleTemplate = {
    eventSummary: "${name} ${icon}",
    eventDetails: "${distance} - ${elevationGain}\n${speedAvg}\n${hrAvg} - ${wattsAvg}\nGear: ${gear}\n${description}"
}
const resetDialog = ref(false)
const newUrlToken = ref<string | false>(false)

const activityTags = computed(() => mainActivityTags || [])
const urlCalendar = computed(() => {
    if (!locationRef.value) return ""

    const location = locationRef.value
    const port = location.port == "80" || location.port == "" ? "" : `:${location.port}`
    const urlToken = store.user.urlToken
    const params: string[] = []

    if (calendarSports.value != "all") params.push(`sports=${calendarSports.value}`)
    if (calendarType.value != "gear") {
        if (excludeCommutes.value && calendarType.value != "clubs") params.push("commutes=0")
        if (excludeNotJoined.value && calendarType.value != "activities") params.push("joined=1")
        if (includeAllCountries.value && calendarType.value != "activities") params.push("countries=1")
    }
    if (linkInDescription.value) params.push("link=1")
    if (compact.value) params.push("compact=1")
    if (daysFrom.value != maxDaysFrom) params.push(`daysfrom=${daysFrom.value}`)
    if (daysTo.value != maxDaysTo) params.push(`daysto=${daysTo.value}`)

    const querystring = params.length > 0 ? `?${params.join("&")}` : ""

    return `${location.hostname}${port}/api/calendar/${user.value.id}/${urlToken}/${calendarType.value}.ics${querystring}`
})
const changedTemplate = computed(() => currentEventSummary.value != calendarTemplate.eventSummary || currentEventDetails.value != calendarTemplate.eventDetails)

/**
 * Save the user's custom calendar template.
 */
const saveTemplate = async () => {
    try {
        const url = `/api/calendar/${user.value.id}/template`
        const data = {eventSummary: calendarTemplate.eventSummary.trim(), eventDetails: calendarTemplate.eventDetails.trim()}

        await api(url, {method: "POST", body: data})

        store.setUserCalendarTemplate(data)
        currentEventSummary.value = data.eventSummary
        currentEventDetails.value = data.eventDetails
        templateWarning.value = true
    } catch (ex) {
        webError("Calendar.saveTemplate", ex)
    }
}

/**
 * Fill the template editor with a sample template.
 */
const setSampleTemplate = () => {
    calendarTemplate.eventSummary = sampleTemplate.eventSummary
    calendarTemplate.eventDetails = sampleTemplate.eventDetails
}

const setActiveField = (field: string) => (activeField.value = field)
const showResetDialog = () => (resetDialog.value = true)
const hideResetDialog = () => (resetDialog.value = false)
const selectTarget = (event: FocusEvent) => (event.target as HTMLInputElement)?.select()

/**
 * Reset the user's calendar URL token.
 */
const resetUrl = async () => {
    try {
        const body = {urlToken: store.user.urlToken}
        const response: any = await api(`/api/users/${user.value.id}/url-token`, {method: "POST", body})

        if (!response || !response.urlToken) {
            throw new Error("Failed to generate a new URL token")
        }

        resetDialog.value = false
        store.setUserData({urlToken: response.urlToken})
        newUrlToken.value = response.urlToken
    } catch (ex) {
        webError("Calendar.resetUrl", ex)
    }
}

onMounted(() => {
    if (!locationRef.value) {
        locationRef.value = window.location
    }
})
</script>
