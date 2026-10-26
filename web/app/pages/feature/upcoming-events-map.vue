<template>
    <div>
        <feature-title header="Upcoming club events map" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>
                        Strautomator makes it damn easy for you to decide which club events you should attend to. It pins your upcoming events on a map, and draws the route in case there's one set on Strava. It even support Komoot routes, if they're
                        linked on the event description!
                    </p>
                    <v-img class="mb-5" src="/images/feature/upcoming-events-map.png"></v-img>
                    <p>The map support different visualization layers, including traffic and road blocks, as well as the weather forecast for each event.</p>
                </div>
            </v-card-text>
        </v-card>

        <div class="mt-6 mb-2">
            <buttons-map />
        </div>
    </div>
</template>

<script setup lang="ts">
definePageMeta({layout: "feature"})
useHead({title: "View your upcoming Strava club events on a map"})
</script>
