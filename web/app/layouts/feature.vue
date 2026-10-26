<template>
    <v-app class="feature site-page">
        <v-main>
            <div class="site-glow site-glow-top"></div>
            <div class="py-2"></div>
            <v-container class="text-center" fluid>
                <div class="home-wrapper">
                    <slot />
                    <feature-links />
                </div>
            </v-container>
        </v-main>

        <section class="feature-cta site-cta" v-if="route.path != '/feature'">
            <h2 class="site-headline site-headline-cta">Turbocharge <span class="gradient-text">your Strava experience</span></h2>
            <p class="site-lead mx-auto">Connect your Strava account today!</p>
            <buttons-automations />
        </section>

        <footer-section />
    </v-app>
</template>

<script setup lang="ts">
const route = useRoute()

useHead({
    meta: [{key: "description", name: "description", content: "Automate your Strava activities! Strautomator is like IFTTT, but for Strava"}]
})
</script>
