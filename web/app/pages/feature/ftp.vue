<template>
    <div>
        <feature-title header="Auto-update your Strava FTP" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>Strautomator can estimate and update the Functional Threshold Power setting on your Strava account, based on your most intensive efforts for the past few weeks.</p>

                    <h2 class="mb-2">How does it estimate my FTP?</h2>
                    <div class="mb-8">
                        <v-alert class="font-weight-bold">eFTP = (C<sup>+30%</sup> + H) / 2</v-alert>
                        <ul class="mt-n1 ml-n2">
                            <li>C = current FTP on Strava, weighted to 130%</li>
                            <li>H = estimated FTP for your highest power effort during the past {{ store.ftpWeeks }} weeks</li>
                        </ul>
                        <div class="mt-4 mb-2">For each recent activity, Strautomator will derive a FTP estimation based on well known formulas.</div>
                        <ul class="ml-n2">
                            <li>79% of your best 5min interval</li>
                            <li>94% of your best 20min interval</li>
                            <li>94% to 100% of the average power if between 20 minutes and 1 hour</li>
                            <li>103% of the average power for each extra hour after the first hour</li>
                        </ul>
                        <div class="mt-4 mb-2">Examples:</div>
                        <ul class="ml-n2">
                            <li>200W for 5 minutes, FTP = 158W</li>
                            <li>200W for 20 minutes, FTP = 188W</li>
                            <li>200W for 1 hour, FTP = 200W</li>
                            <li>200W for 4 hours, FTP = 225W</li>
                        </ul>
                    </div>

                    <h2 class="mt-4 mb-2">How can I enable the feature?</h2>
                    <v-img class="mb-2" src="/images/feature/ftp-auto-update.png"></v-img>
                    <div class="mb-8">
                        <ul class="ml-n2">
                            <li>Go to My Account</li>
                            <li>Toggle the "FTP auto update" on</li>
                            <li>Your FTP will be estimated every 2 weeks</li>
                        </ul>
                        <div class="mt-4">The FTP auto update is available to PRO accounts only. Users with a free account can still estimate and save their FTP to Strava manually, by using the "What's my estimated FTP" button.</div>
                    </div>

                    <h2 class="mb-2">How accurate is the estimation?</h2>
                    <div class="mb-2">The calculation of the FTP based on the activity power and time is using well known formulas.</div>
                    <div class="mb-2">The final estimation of your FTP is quite conservative, as it gives more weight to your current FTP set on Strava. So if you're taking it easy on the bike for some weeks, it won't drastically lower it.</div>
                </div>
            </v-card-text>
        </v-card>

        <div class="mt-6 mb-2">
            <buttons-account />
        </div>
    </div>
</template>

<script setup lang="ts">
definePageMeta({layout: "feature"})
useHead({title: "Estimate and update your Strava FTP"})

const store = useMainStore()
</script>
