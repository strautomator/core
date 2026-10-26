<template>
    <div>
        <feature-title header="Automatically tag your commutes" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>Strautomator can automatically tag your daily commutes!</p>

                    <h2 class="mb-2">1. First, define the conditions</h2>
                    <v-img class="mb-2" src="/images/feature/condition-end-location.png"></v-img>
                    <div class="mb-8">Define what should trigger this automation. Here we're using an "End location" condition, pointing to the address where the activity should end.</div>

                    <h2 class="mb-2">2. Then create a commute action</h2>
                    <v-img class="mb-2" src="/images/feature/action-commute.png"></v-img>
                    <div class="mb-8">The action above tells Strautomator to mark the activity as "Commute" on Strava.</div>

                    <h2 class="mb-2">3. Review your automation</h2>
                    <v-img class="mb-2" src="/images/feature/commute-automation.png"></v-img>
                    <div class="mb-8">Review the automation conditions and actions, save, and you're good to go!</div>

                    <h2 class="mb-2">Sample commute conditions</h2>
                    <p>You can use any conditions mix to define what is a commute. Some ideas:</p>
                    <ul class="ml-n2 mb-6">
                        <li>Distance is less than 10km</li>
                        <li>Average speed is less than 20kph</li>
                        <li>Device used is a Garmin Edge 130</li>
                        <li>Time is around 8:00 AM</li>
                    </ul>
                    <p>And if you don't want to SPAM other users feeds with your commutes, you can also <a href="/feature/mute">mute</a> these activities so they won't show up for others.</p>
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
useHead({title: "Automatically tag your Strava commutes"})
</script>
