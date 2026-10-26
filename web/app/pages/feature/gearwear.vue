<template>
    <div>
        <feature-title header="Track your equipment mileage" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>With Strautomator you can easily track the mileage and usage of your bike components, and get notified when they need to be replaced.</p>

                    <h2 class="mb-2">1. Create a new configuration</h2>
                    <v-img class="mb-2" src="/images/feature/gearwear-list.png"></v-img>
                    <div class="mb-8">On the Gear view, you'll see the list of your current gear configurations. To create a new one, tap on the + sign next to the gear which you want to configure.</div>

                    <h2 class="mb-2">2. Define the components</h2>
                    <v-img class="mb-2" src="/images/feature/gearwear-new.png"></v-img>
                    <div class="mb-8">Each gear configuration can have as many components as needed. You can start with the defaults and also use the "Since date" field to calculate the usage since a specific date.</div>

                    <h2 class="mb-2">3. Edit individual components</h2>
                    <v-img class="mb-2" src="/images/feature/gearwear-edit-component.png"></v-img>
                    <div class="mb-8">You can easily change the component tracking and alert thresholds whenever you wish.</div>

                    <h2 class="mb-2">4. Review your components</h2>
                    <v-img class="mb-2" src="/images/feature/gearwear-components.png"></v-img>
                    <div class="mb-8">Review the components, save the configuration, and you're good to go!</div>

                    <h2 class="mb-2">Tracking and alerting</h2>
                    <p>
                        The usage (distance and time) of the components will be updated automatically with each activity, having a delay of 2 days from the time of the activity by default. This is to ensure that you have plenty of time to set the
                        correct gear on the activities.
                    </p>
                    <p>
                        When a component hits the specified alert threshold, you'll get an email to remind you that it's time to swap it. Reminders will be sent out every few days until you swap the component and trigger the mileage reset using the
                        link provided on the email.
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
useHead({title: "Track your Strava equipment mileage"})
</script>
