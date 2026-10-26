<template>
    <div>
        <feature-title header="Track your sensor batteries" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>With Strautomator you can keep track of the battery status of all sensors connected to your Garmin or Wahoo device.</p>

                    <h2 class="mb-2">1. Link your Garmin or Wahoo</h2>
                    <v-img class="mb-2" src="/images/feature/account-link-garmin.png"></v-img>
                    <div class="mb-8">Go to your Account and click the button to link your Garmin or Wahoo profiles and follow the instructions. This will allow Strautomator to extract the sensor data from the original FIT files.</div>

                    <h2 class="mb-2">2. Ride, run, grind!</h2>
                    <div class="mb-8">Keep doing your regular activities on Strava as usual. Strautomator will be parsing the FIT files and tracking the batteries of your connected sensors in the background.</div>

                    <h2 class="mb-2">3. Track it</h2>
                    <v-img class="mb-2" src="/images/feature/battery-tracking.png"></v-img>
                    <div class="mb-8">Go to Gear to keep track of the battery level of sensors that were used in your activities.</div>

                    <h2 class="mb-2">Calendar and notifications</h2>
                    <p>
                        The battery tracking is integrated with exported <nuxt-link to="/feature/calendar">calendars</nuxt-link>, so you will see an event whenever a sensor battery status is low or critical. Users might also opt-in to get an email
                        with a reminder to recharge or replace affected batteries.
                    </p>
                </div>
            </v-card-text>
        </v-card>

        <div class="mt-6 mb-2">
            <buttons-gear />
        </div>
    </div>
</template>

<script setup lang="ts">
definePageMeta({layout: "feature"})
useHead({title: "Track your sensor batteries from Strava activities"})
</script>
