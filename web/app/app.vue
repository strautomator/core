<template>
    <NuxtLoadingIndicator color="#FFECB3" />
    <NuxtLayout>
        <NuxtPage />
    </NuxtLayout>
</template>

<script setup lang="ts">
const store = useMainStore()

useHead({
    titleTemplate: (title) => (title ? `${store.appTitle} - ${title}` : store.appTitle)
})
</script>
