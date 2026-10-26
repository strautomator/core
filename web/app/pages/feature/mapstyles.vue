<template>
    <div>
        <feature-title header="Set a default map style for activities" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>Strautomator can automatically set different map styles for different types of activities. Power for rides, speed for runs, and Satellite 3D for hikes? Easy!</p>

                    <h2 class="mb-2">1. Define a sport type condition</h2>
                    <v-img class="mb-2" src="/images/feature/condition-sport-type.png"></v-img>
                    <div class="mb-8">Define which sport types should trigger the automation. Here we have selected most of the cycling activity types.</div>

                    <h2 class="mb-2">2. Then, create a map action</h2>
                    <v-img class="mb-2" src="/images/feature/action-mapstyle.png"></v-img>
                    <div class="mb-8">Define an action to set the map style. Here we're using the "Speed" map.</div>

                    <h2 class="mb-2">3. Review your automation</h2>
                    <v-img class="mb-2" src="/images/feature/mapstyle-automation.png"></v-img>
                    <div>Review the automation conditions and actions, save, and you're good to go!</div>
                </div>
            </v-card-text>
        </v-card>

        <div class="mt-6 mb-2">
            <buttons-automations />
        </div>
    </div>
</template>

<script setup lang="ts">
definePageMeta({layout: "feature"})
useHead({title: "Set a default map style on Strava activities"})
</script>
