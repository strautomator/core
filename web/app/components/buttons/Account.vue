<template>
    <v-btn color="primary" to="/account" title="My Account" rounded v-if="store.user">
        <v-icon start>mdi-link</v-icon>
        Go to My Account
    </v-btn>
    <buttons-connect-strava v-else />
</template>

<script setup lang="ts">
const store = useMainStore()
</script>
