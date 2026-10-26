<template>
    <div>
        <v-container fluid>
            <h1>{{ !accountDeleted ? "Close my account" : "Account deleted" }}</h1>
            <v-card>
                <v-card-text>
                    <div v-if="!accountDeleted">
                        <h2 class="mb-6">Danger zone</h2>
                        <p>
                            <span class="font-weight-bold">Are you really sure?</span>
                            Once you hit that button, there's no way back. All your data will be deleted straight away, and Strautomator will drop its connection to your Strava account.
                        </p>
                        <div class="text-center mt-8">
                            <v-btn color="gray" class="mr-2" to="/account" title="Back to my account" variant="text" rounded>
                                <v-icon start>mdi-arrow-left</v-icon>
                                Back
                            </v-btn>
                            <v-btn color="removal" @click="cancelAccount()" title="Goodbye :-(" rounded>
                                <v-icon start>mdi-close-circle</v-icon>
                                Close account
                            </v-btn>
                        </div>
                    </div>
                    <div v-else>
                        <p class="text-h6 mb-2">Sad to see you go &#x1F615;</p>
                        <p>If you change your mind in the future you can always come back and connect Strautomator to your Strava account again.</p>
                        <p class="mt-12">
                            <nuxt-link to="/home" title="Back to the homepage..." class="text-caption">Back to the homepage...</nuxt-link>
                        </p>
                    </div>
                </v-card-text>
            </v-card>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Goodbye?"})

const api = useApi()
const webError = useWebError()
const {logout} = useAuth()
const {user} = useUser()

const accountDeleted = ref(false)

/**
 * Delete the current account and logout after a short delay.
 */
const cancelAccount = async () => {
    try {
        await api(`/api/users/${user.value.id}`, {method: "DELETE"})
        accountDeleted.value = true

        setTimeout(() => logout(), 3000)
    } catch (ex) {
        webError("AccountGoodbye.cancelAccount", ex)
    }
}
</script>
