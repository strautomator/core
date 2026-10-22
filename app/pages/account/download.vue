<template>
    <div>
        <v-container fluid>
            <h1>Download my data</h1>
            <v-card class="mt-3" variant="outlined">
                <v-card-text class="pa-0">
                    <div class="pa-4">
                        Here you can download a ZIP file with all the data that Strautomator holds about you.
                        <div v-if="user && user.dateLastArchiveGenerated">You can generate a new archive every {{ store.archiveDownloadDays }} days.</div>
                        <div v-if="user.dateLastArchiveGenerated">Your last archive was created at {{ $dayjs(user.dateLastArchiveGenerated).format("ll") }}.</div>
                    </div>
                    <h3 class="pl-4 pb-2">What's included?</h3>
                    <ul class="pl-8">
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">Activities</li>
                        <li>Processed activities</li>
                        <li>Activities queued for processing</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">FitActivities</li>
                        <li>Processed FIT summaries from Garmin</li>
                        <li>Processed FIT summaries from Wahoo</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">Automations</li>
                        <li>Automation statistics</li>
                        <li>Shared automations</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">AthleteRecords</li>
                        <li>Personal activity records</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">Calendars</li>
                        <li>Calendar configurations</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">GearWear</li>
                        <li>GearWear configurations</li>
                        <li>Battery tracker</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">Notifications</li>
                        <li>Read and unread notifications</li>
                        <li>Read announcements</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">Subscription</li>
                        <li>PRO subscription details</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">User</li>
                        <li>Account details and preferences</li>
                        <li>Strava profile</li>
                        <li>Automation configurations</li>
                        <li class="font-weight-bold gdpr-list-header" v-if="mdAndUp">*.ics</li>
                        <li>Cached exported calendars</li>
                    </ul>

                    <v-divider class="mt-6"></v-divider>

                    <div class="pa-4">
                        Some of the data indicated above might be missing, depending on which features you're using. The download does <span class="font-weight-bold">not</span> include your account tokens, credentials, short-lived cache and access
                        logs.
                    </div>

                    <div class="pa-3 text-center text-md-left">
                        <v-btn class="ma-1" color="primary" title="Download my data" @click="downloadArchive" rounded>
                            <v-icon start>mdi-archive-arrow-down</v-icon>
                            {{ isNewArchive ? "Download new archive" : "Download existing archive" }}
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs"

useHead({title: "Download my data"})

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()

const isNewArchive = computed(() => {
    if (!user.value.dateLastArchiveGenerated) return true
    return dayjs().diff(user.value.dateLastArchiveGenerated, "days") >= store.archiveDownloadDays
})

/**
 * Request an archive download URL and open it in a new window.
 */
const downloadArchive = async () => {
    try {
        const result: any = await api(`/api/users/${user.value.id}/archive-download`)

        if (!result || !result.url) {
            throw new Error("Failed to generated a download URL")
        }

        window.open(result.url, "strautomator-download")
    } catch (ex) {
        webError("Account.downloadArchive", ex)
    }
}
</script>
