<template>
    <div>
        <site-header header="Everything your activities were missing" lead="Automations, AI, gear tracking, weather, music and a lot more. Pick a feature and see how it works." />

        <section class="feature-block">
            <feature-ai-insights />
        </section>

        <section class="feature-block">
            <feature-ai />
        </section>

        <section class="feature-block">
            <feature-battery-tracker />
        </section>

        <section class="feature-block">
            <feature-calendar />
        </section>

        <section class="feature-block">
            <feature-commute />
        </section>

        <section class="feature-block">
            <feature-counter />
        </section>

        <section class="feature-block">
            <feature-ftp />
        </section>

        <section class="feature-block">
            <feature-gearwear />
        </section>

        <section class="feature-block">
            <feature-mapstyles />
        </section>

        <section class="feature-block">
            <feature-mcp />
        </section>

        <section class="feature-block">
            <feature-mute />
        </section>

        <section class="feature-block">
            <feature-records />
        </section>

        <section class="feature-block">
            <feature-spotify />
        </section>

        <section class="feature-block">
            <feature-upcoming-events-map />
        </section>

        <section class="feature-block">
            <feature-weather />
        </section>
    </div>
</template>

<script setup lang="ts">
import FeatureAi from "./ai.vue"
import FeatureAiInsights from "./ai-insights.vue"
import FeatureBatteryTracker from "./battery-tracker.vue"
import FeatureCalendar from "./calendar.vue"
import FeatureCommute from "./commute.vue"
import FeatureCounter from "./counter.vue"
import FeatureFtp from "./ftp.vue"
import FeatureGearwear from "./gearwear.vue"
import FeatureMapstyles from "./mapstyles.vue"
import FeatureMcp from "./mcp.vue"
import FeatureMute from "./mute.vue"
import FeatureRecords from "./records.vue"
import FeatureSpotify from "./spotify.vue"
import FeatureUpcomingEventsMap from "./upcoming-events-map.vue"
import FeatureWeather from "./weather.vue"

definePageMeta({layout: "feature"})
useHead({title: "Strautomator features"})
</script>
