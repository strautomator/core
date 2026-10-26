<template>
    <div></div>
</template>

<script setup lang="ts">
definePageMeta({layout: "landing"})

const route = useRoute()

if (route.query.status) {
    throw createError({
        status: parseInt(route.query.status as string) || 500,
        message: (route.query.message as string) || "",
        data: {title: (route.query.title as string) || "", description: (route.query.message as string) || ""},
        fatal: true
    })
}

await navigateTo("/")
</script>
