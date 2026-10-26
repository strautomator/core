<template>
    <div>
        <v-container fluid>
            <div class="mt-4 mb-8 text-center text-h2 font-weight-black">Thank you!</div>
            <v-card>
                <v-card-text>
                    <p>Hi {{ user.profile.firstName }}!</p>
                    <p v-if="route.query.donation">Your support is truly appreciated! Your account will be switched to PRO automatically in a few minutes.</p>
                    <p v-else>Your donation is truly appreciated! Hope you are enjoying all the features that Strautomator has to offer.</p>
                </v-card-text>
            </v-card>
            <div class="mt-8 text-center">
                <v-btn color="primary" to="/account" title="Back to my account" exact rounded>
                    <v-icon start>mdi-arrow-left</v-icon>
                    Back to My Account
                </v-btn>
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Thank you!"})

const store = useMainStore()
const route = useRoute()
const {user} = useUser()

onMounted(() => {
    if (user.value?.paddleTransactionId) {
        store.setUserData({paddleTransactionId: null})
    }

    setTimeout(() => (window.location.href = "/billing"), 5000)
})
</script>
