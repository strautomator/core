<template>
    <div>
        <feature-title header="Last.fm tracks on your activities" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>Strautomator allows you to connect your Last.fm account to Strava activities!</p>

                    <h2 class="mb-2">1. Link your Last.fm account</h2>
                    <v-img class="mb-2" src="/images/feature/lastfm-link.png"></v-img>
                    <div class="mb-8">Go to "My Account" and use the button "Link Last.fm Account".</div>

                    <h2 class="mb-2">2. Use Last.fm tags on your actions</h2>
                    <v-img class="mb-2" src="/images/feature/lastfm-action.png"></v-img>
                    <div class="mb-8">On your automation, define an action to add any of the Last.fm tags to the activity name or description. Here we're adding the lyrics of the first track and the full track list played during the activity.</div>

                    <h2 class="mb-2">3. Review your automation</h2>
                    <div class="mb-8">Review the automation conditions and actions, save, and have fun with your tracks!</div>
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
useHead({title: "Last.fm tracks and lyrics on your Strava activities"})
</script>
