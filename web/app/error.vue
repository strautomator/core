<template>
    <v-app>
        <div class="text-center mt-10">
            <div class="width-wrapper text-center">
                <img src="/images/logo-round.svg" width="96" height="96" class="strautologo" />

                <div class="mt-8">
                    <h1 class="text-h4">{{ errorDetails.title }}</h1>
                    <div class="text-h5">{{ errorDetails.message }}</div>
                </div>
                <div class="mt-8" v-if="showLogin">
                    <div class="mt-4 mb-4">
                        <a title="Connect with Strava..." @click="login()"><img class="strava-connect" src="/images/strava-connect.svg" /></a>
                    </div>
                </div>
                <div class="mt-8" v-else>
                    <p>
                        If you are just sneaking around then I wish you happy exploring.
                        <br v-if="mdAndUp" />
                        Otherwise, if you need help, please contact me on
                        <a href="mailto:info@strautomator.com" title="Bug report via email">info@strautomator.com</a>.
                    </p>
                </div>
                <v-alert color="error" border="top" v-if="stravaStatus" class="mt-4 mb-4">
                    <div class="font-weight-bold">Strava status: {{ stravaStatus }}</div>
                    <p>Please note that outages and issues on the Strava website might possibly affect Strautomator.</p>
                    <div>
                        <a class="text-secondary" href="https://status.strava.com" title="Strava API status">https://status.strava.com</a>
                    </div>
                </v-alert>
                <div class="mt-6">
                    <v-btn color="primary" title="Go back home..." @click="backHome" size="small" rounded>Back home</v-btn>
                </div>
            </div>
        </div>
    </v-app>
</template>

<script setup lang="ts">
import type {NuxtError} from "#app"

const props = defineProps<{error: NuxtError<{title?: string; description?: string}>}>()

const {mdAndUp} = useDisplay()
const {stravaStatus, getStravaStatus} = useStrava()
const {login} = useAuth()

const status = computed(() => {
    const errMessage = props.error?.message || ""
    if (errMessage.includes("status code 401")) return 401
    return props.error?.status || props.error?.statusCode || 500
})

const errorDetails = computed(() => {
    const title = props.error?.data?.title
    let message = props.error?.data?.description || props.error?.message

    if (message && message.indexOf("{") == 0 && message.indexOf("}") > 0) {
        message = null
    }

    if (status.value == 401 || status.value == 403) {
        return {title: title || "Access denied", message: "Please try connecting to Strava again, allowing all the requested permissions."}
    } else if (status.value == 402) {
        return {title: title || "PRO users only", message: "This resource is available to PRO users only, sorry."}
    } else if (status.value == 404) {
        return {title: title || "Lost GPS signal", message: "This is the infamous error 404. We can't find this route."}
    }

    return {title: title || "Crashed while sprinting", message: message || "Something went very, very wrong."}
})

const showLogin = computed(() => status.value == 401 || status.value == 403)

useHead({title: () => `Error ${status.value}`})

onMounted(() => getStravaStatus())

const backHome = () => (window.location.href = "/")
</script>
