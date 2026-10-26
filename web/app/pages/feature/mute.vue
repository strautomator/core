<template>
    <div>
        <feature-title header="Automatically mute your activities" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>Strautomator can automatically mute your commutes, rides to the bakery, short runs... basically any activity that you wish to be hidden from other home feeds.</p>

                    <h2 class="mb-2">1. First, define the conditions</h2>
                    <v-img class="mb-2" src="/images/feature/condition-end-location.png"></v-img>
                    <div class="mb-8">Define what should trigger this automation. Here we're using an "End location" condition, pointing to the address where the activity ends.</div>

                    <h2 class="mb-2">2. Then, create a mute action</h2>
                    <v-img class="mb-2" src="/images/feature/action-mute.png"></v-img>
                    <div class="mb-8">The action above tells Strautomator to mute the activity on other people's feeds.</div>

                    <h2 class="mb-2">3. Review your automation</h2>
                    <v-img class="mb-2" src="/images/feature/mute-automation.png"></v-img>
                    <div>Review the automation conditions and actions, save it, and done!</div>
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
useHead({title: "Automatically mute your Strava activities"})
</script>
