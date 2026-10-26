<template>
    <v-app class="text-center">
        <v-app-bar :height="smAndDown ? 56 : 64">
            <v-toolbar-title class="mr-10 ml-1 flex-0-0">
                <nuxt-link to="/dashboard">
                    <img src="/images/logo-round.svg" width="48" height="48" class="strautologo float-left" />
                    <span class="app-bar-brand d-inline-block ml-2 mt-2">Strautomator</span>
                </nuxt-link>
            </v-toolbar-title>

            <v-toolbar-items class="d-none d-md-flex">
                <v-btn to="/automations" :active="isSection('/automations')">Automations</v-btn>
                <v-btn to="/gear" :active="isSection('/gear')">Gear</v-btn>
                <v-btn to="/calendar" :active="isSection('/calendar')">Calendar</v-btn>
                <v-btn to="/map" :active="isSection('/map')">Map</v-btn>
                <v-btn to="/help" :active="isSection('/help')">Help</v-btn>
            </v-toolbar-items>

            <v-spacer></v-spacer>
            <top-notifications />

            <nuxt-link to="/account" title="Go to My Account">
                <v-icon v-if="store.user?.preferences?.privacyMode" class="ml-1" size="large">mdi-incognito</v-icon>
                <v-avatar class="ml-4" v-else-if="store.user?.profile?.urlAvatar" :size="mdAndUp ? 48 : 32" :image="store.user.profile.urlAvatar"></v-avatar>
            </nuxt-link>
            <v-btn color="info" class="ml-1 mr-n3 mr-md-0" title="Logout" @click="logoutDialog = true" variant="text" rounded>
                <v-icon>mdi-logout</v-icon>
                <span v-if="!smAndDown" class="d-none d-md-inline text-caption">Logout</span>
            </v-btn>
        </v-app-bar>

        <v-main>
            <v-container class="width-wrapper" fluid>
                <slot v-if="store.user" />
                <ads-panel />
            </v-container>

            <div class="mt-3 text-center">
                <footer-section />
            </div>

            <v-snackbar v-if="route.query.message" v-model="snackMessage" class="text-left" color="accent" :timeout="300000" location="bottom" rounded>
                {{ route.query.message }}
                <template #actions>
                    <v-icon @click="snackMessage = false">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
        </v-main>

        <v-bottom-navigation class="d-md-none" color="primary" :active="smAndDown" :model-value="activeNavBtn" grow>
            <v-btn value="/dashboard" to="/dashboard" :active="isSection('/dashboard')">
                <v-icon>mdi-home</v-icon>
                <span>Home</span>
            </v-btn>
            <v-btn value="/automations" to="/automations" :active="isSection('/automations')">
                <v-icon>mdi-file-tree</v-icon>
                <span>Automations</span>
            </v-btn>
            <v-btn value="/gear" to="/gear" :active="isSection('/gear')">
                <v-icon>mdi-cog-refresh</v-icon>
                <span>Gear</span>
            </v-btn>
            <v-btn value="/calendar" to="/calendar" :active="isSection('/calendar')">
                <v-icon>mdi-calendar</v-icon>
                <span>Calendar</span>
            </v-btn>
            <v-btn value="/map" to="/map" :active="isSection('/map')">
                <v-icon>mdi-map</v-icon>
                <span>Map</span>
            </v-btn>
        </v-bottom-navigation>

        <v-dialog v-model="logoutDialog" width="440" opacity="0.95">
            <v-card>
                <v-toolbar color="accent">
                    <v-toolbar-title>Logout</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="logoutDialog = false"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <p class="mt-3">Do you want to logout from Strautomator?</p>
                    <p>To log back in please use the <strong>Connect with Strava</strong> button again on the homepage.</p>
                    <div class="text-right">
                        <v-btn class="mr-2" color="grey" title="Stay here" @click.stop="logoutDialog = false" variant="text" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Cancel
                        </v-btn>
                        <v-btn color="removal" title="Yes, logout" @click="logout()" rounded>
                            <v-icon start>mdi-logout</v-icon>
                            Logout
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>

        <v-dialog v-model="errorDialog" width="440" opacity="0.95">
            <v-card>
                <v-toolbar color="error">
                    <v-toolbar-title>{{ store.errorTitle }}</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="hideErrorDialog"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <p class="mt-3">Reference method: {{ store.errorMethod }}</p>
                    <p>{{ store.errorMessage }}</p>
                    <div class="text-center text-md-right">
                        <v-btn class="mr-2" color="accent" title="Back to the Dashboard" @click.stop="goToDashboard" rounded>
                            <v-icon start>mdi-refresh</v-icon>
                            Reload
                        </v-btn>
                        <v-btn color="accent" title="Ignore this error and continue" @click.stop="hideErrorDialog" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Close
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>
    </v-app>
</template>

<script setup lang="ts">
const store = useMainStore()
const route = useRoute()
const {mdAndUp, smAndDown} = useDisplay()
const {logout} = useAuth()

useHead({
    meta: [{key: "description", name: "description", content: "Automate your Strava activities! Strautomator is like IFTTT, but for Strava"}]
})

const logoutDialog = ref(false)
const snackMessage = ref(!!route.query.message)

const activeNavBtn = computed(() => route.path || null)

// Vue Router 3 marked links as active for child routes too (e.g. /automations/edit).
const isSection = (path: string) => route.path == path || route.path.startsWith(`${path}/`)

const errorDialog = computed({
    get: () => store.hasError,
    set: (value: boolean) => {
        if (!value) store.setError(null)
    }
})

watch(
    () => route.query.message,
    (message) => (snackMessage.value = !!message)
)

onMounted(() => {
    if (!store.user) {
        document.location.href = `/error?status=401&title=${encodeURIComponent("User not found")}`
    }
})

const goToDashboard = () => (document.location.href = "/dashboard")
const hideErrorDialog = () => store.setError(null)
</script>
