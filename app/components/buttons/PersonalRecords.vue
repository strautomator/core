<template>
    <v-btn color="primary" to="/dashboard/records" title="Personal Records" rounded v-if="store.user">
        <v-icon start>mdi-link</v-icon>
        Go to Personal Records
    </v-btn>
    <buttons-connect-strava v-else />
</template>

<script setup lang="ts">
const store = useMainStore()
</script>
