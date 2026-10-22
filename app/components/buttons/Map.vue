<template>
    <v-btn color="primary" to="/map" title="Map" rounded v-if="store.user">
        <v-icon start>mdi-link</v-icon>
        Go to Map
    </v-btn>
    <buttons-connect-strava v-else />
</template>

<script setup lang="ts">
const store = useMainStore()
</script>
