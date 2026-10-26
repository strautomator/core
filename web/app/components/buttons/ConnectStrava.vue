<template>
    <a title="Connect with Strava..." @click="login()"><img class="strava-connect" src="/images/strava-connect.svg" /></a>
</template>

<script setup lang="ts">
const {login} = useAuth()
</script>
