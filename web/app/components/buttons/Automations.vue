<template>
    <v-btn color="primary" to="/automations" title="My Automations" rounded v-if="store.user">
        <v-icon start>mdi-link</v-icon>
        Go to My Automations
    </v-btn>
    <buttons-connect-strava v-else />
</template>

<script setup lang="ts">
const store = useMainStore()
</script>
