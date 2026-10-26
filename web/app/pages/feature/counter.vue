<template>
    <div>
        <feature-title header="Auto-incrementing activity counter" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>Strautomator can automatically add a counter to your repeating activities. For instance you could name your regular cake rides as "Cake ride #1" and "#2, #3, #4" and so on.</p>

                    <h2 class="mb-2">1. First, define the conditions</h2>
                    <v-img class="mb-2" src="/images/feature/condition-end-location.png"></v-img>
                    <div class="mb-8">Define what should trigger this automation. Here we're using a "Passes on location", stating the address of a favourite bakery.</div>

                    <h2 class="mb-2">2. Create a counter based action</h2>
                    <v-img class="mb-2" src="/images/feature/action-counter.png"></v-img>
                    <div class="mb-8">Here we're using a "Set activity name" action, and adding the counter to the end of the activity name. The tag <code>${counter}</code> will be replaced with the actual counter.</div>

                    <h2 class="mb-2">3. Review your automation</h2>
                    <v-img class="mb-2" src="/images/feature/counter-automation.png"></v-img>
                    <div class="mb-2">Review the automation conditions and actions, save, and you're good to go! Also note that you if you're using a counter, you can change its current value at any time.</div>
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
useHead({title: "Auto-incrementing counters on your Strava activities"})
</script>
