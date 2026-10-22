<template>
    <v-btn color="primary" to="/gear" title="My Gear" rounded v-if="store.user">
        <v-icon start>mdi-link</v-icon>
        Go to My Gear
    </v-btn>
    <buttons-connect-strava v-else />
</template>

<script setup lang="ts">
const store = useMainStore()
</script>
