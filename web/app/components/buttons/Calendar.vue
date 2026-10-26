<template>
    <v-btn color="primary" to="/calendar" title="Calendar" rounded v-if="store.user">
        <v-icon start>mdi-link</v-icon>
        Go to Calendar
    </v-btn>
    <buttons-connect-strava v-else />
</template>

<script setup lang="ts">
const store = useMainStore()
</script>
