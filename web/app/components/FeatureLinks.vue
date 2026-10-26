<template>
    <div class="feature-links mt-12 mb-4 text-left">
        <h2 class="feature-links-title text-center">Strautomator features</h2>
        <div class="feature-links-grid">
            <nuxt-link v-for="link in links" :key="link.to" :to="link.to" class="feature-link">
                <v-icon size="small" color="primary" start>{{ link.icon }}</v-icon>
                <span>{{ link.text }}</span>
            </nuxt-link>
        </div>
    </div>
</template>

<script setup lang="ts">
const links = [
    {to: "/feature/ai", icon: "mdi-robot-happy-outline", text: "Let AI name your activities"},
    {to: "/feature/ai-insights", icon: "mdi-brain", text: "Private AI insights on your activities"},
    {to: "/feature/mcp", icon: "mdi-connection", text: "Connect AI clients to your account"},
    {to: "/feature/weather", icon: "mdi-weather-partly-rainy", text: "Weather data on your activities"},
    {to: "/feature/spotify", icon: "mdi-spotify", text: "Spotify tracks on your activities"},
    {to: "/feature/lastfm", icon: "mdi-headphones", text: "Last.fm tracks on your activities"},
    {to: "/feature/commute", icon: "mdi-bike-fast", text: "Automatically tag your commutes"},
    {to: "/feature/mute", icon: "mdi-eye-off-outline", text: "Automatically mute your activities"},
    {to: "/feature/counter", icon: "mdi-counter", text: "Auto-incrementing activity counter"},
    {to: "/feature/ftp", icon: "mdi-heart-flash", text: "Auto-update your FTP"},
    {to: "/feature/mapstyles", icon: "mdi-map-outline", text: "Set a default map style for activities"},
    {to: "/feature/gearwear", icon: "mdi-wrench-clock", text: "Track your equipment mileage"},
    {to: "/feature/battery-tracker", icon: "mdi-battery-charging-80", text: "Track your sensor batteries"},
    {to: "/feature/calendar", icon: "mdi-calendar-export", text: "Export your Strava calendar"},
    {to: "/feature/upcoming-events-map", icon: "mdi-map-marker-radius", text: "View your upcoming events map"},
    {to: "/feature/records", icon: "mdi-trophy-outline", text: "Track your personal records"}
]
</script>
