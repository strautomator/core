<template>
    <div>
        <feature-title header="Export your Strava calendar" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>
                        With Strautomator, you can have your Strava activities and upcoming club events displayed on your favourite calendar app. Calendars are exported with the .ics format, and compatible with most popular calendar applications and
                        services.
                    </p>

                    <h2 class="mb-2">How can I subscribe?</h2>
                    <v-img class="mb-2" src="/images/feature/calendar-subscribe.png"></v-img>

                    <ul class="ml-n2 mb-6">
                        <li>Go to the Calendar tab</li>
                        <li>Choose your desired calendar options</li>
                        <li>Use the "Subscribe to calendar" button, or copy the URL directly from the text field</li>
                    </ul>

                    <p>PRO users can export many years of past activities and club events, and the next year of upcoming club events. Free accounts are limited to just a few weeks of data.</p>
                </div>
            </v-card-text>
        </v-card>

        <div class="mt-6 mb-2">
            <buttons-calendar />
        </div>
    </div>
</template>

<script setup lang="ts">
definePageMeta({layout: "feature"})
useHead({title: "Export your Strava activities and club events to your calendar"})
</script>
