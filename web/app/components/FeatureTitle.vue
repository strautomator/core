<template>
    <div>
        <site-header v-if="!isIndex" :header="header" />
        <h2 v-else class="feature-section-title">{{ header }}</h2>
    </div>
</template>

<script setup lang="ts">
defineProps<{header?: string}>()

const route = useRoute()
const isIndex = computed(() => route.path == "/feature")
</script>
