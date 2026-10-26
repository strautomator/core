<template>
    <div>
        <feature-title header="Spotify tracks on your activities" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>Strautomator allows you to add your Spotify track list and track lyrics to your activities!</p>

                    <h2 class="mb-2">1. Link your Spotify account</h2>
                    <v-img class="mb-2" src="/images/feature/spotify-link.png"></v-img>
                    <div class="mb-8">Go to "My Account" and use the button "Link Spotify Account".</div>

                    <h2 class="mb-2">2. Set a Spotify action</h2>
                    <v-img class="mb-2" src="/images/feature/spotify-action.png"></v-img>
                    <div class="mb-8">On your automation, define an action to add any of the available Spotify tags to the activity name or description. Here we're adding the track list played during the activity.</div>

                    <h2 class="mb-2">3. Review your automation</h2>
                    <v-img class="mb-2" src="/images/feature/spotify-automation.png"></v-img>
                    <div class="mb-8">Review the automation conditions and actions, save, and enjoy having your tracks played during an activity shown in Strava.</div>

                    <h2 class="mb-2">Available Spotify tags</h2>
                    <p>The following tags are available for Spotify:</p>
                    <ul class="ml-n2 mb-6">
                        <li>Full track list</li>
                        <li>Title of track playing at the start or end</li>
                        <li>Lyrics of the track playing at the start or end</li>
                    </ul>
                    <p>The Spotify integration is available to all users, but some of its tags and features are available to PRO users only.</p>
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
useHead({title: "Spotify tracks and lyrics on your Strava activities"})
</script>
