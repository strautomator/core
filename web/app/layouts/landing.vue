<template>
    <v-app class="landing">
        <v-main>
            <slot />
        </v-main>

        <footer-section />
    </v-app>
</template>

<script setup lang="ts">
useHead({
    meta: [{key: "description", name: "description", content: "Automate your Strava activities! Strautomator is like IFTTT, but for Strava"}]
})
</script>
