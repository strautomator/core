<template>
    <div>
        <div class="mb-6 text-center strava-powered">
            <img src="/images/strava-powered.svg" width="130" />
        </div>
        <div class="mb-6 text-center">
            <nuxt-link to="/account" title="My Account" v-if="loggedIn"><v-icon class="ml-2 mr-2">mdi-account</v-icon></nuxt-link>
            <nuxt-link to="/help" title="Need help?"><v-icon class="ml-2 mr-2">mdi-help-circle</v-icon></nuxt-link>
            <a href="https://github.com/strautomator" title="Strautomator @ GitHub"><v-icon class="ml-2 mr-2">mdi-github</v-icon></a>
        </div>
        <v-footer class="justify-center" color="#101010" height="100">
            <div class="text-h6 font-weight-light text-grey-lighten-1 text-center pt-2">
                <a href="/home" title="Home">
                    <img src="/images/logo.svg" width="16" height="16" class="strautologo mt-n1" />
                </a>
                <span>Strautomator.com</span>
                <v-chip v-if="isPro" color="primary" class="text-caption mb-1 ml-1" size="small" variant="outlined">PRO</v-chip>
                <div class="mt-3 text-caption">
                    <nuxt-link to="/billing" title="Get PRO" v-if="!isPro && loggedIn">Get PRO</nuxt-link>
                    <nuxt-link to="/tc" title="Terms and Conditions" class="ml-5">Terms and Conditions</nuxt-link>
                    <nuxt-link to="/impressum" title="Impressum" class="ml-5" v-if="impressum">Impressum</nuxt-link>
                </div>
            </div>
        </v-footer>
    </div>
</template>

<script setup lang="ts">
const store = useMainStore()

const loggedIn = computed(() => !!store.user)
const isPro = computed(() => !!store.user?.isPro)
const impressum = computed(() => ["AT", "BE", "CH", "DE"].includes(store.country))
</script>
