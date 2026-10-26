<template>
    <div class="site-header text-center">
        <div class="site-brand mb-6">
            <a href="/home" title="Home">
                <img src="/images/logo.svg" alt="" width="22" height="22" class="strautologo mt-n1" />
                <span>Strautomator</span>
            </a>
        </div>
        <h1 class="site-headline">{{ header }}</h1>
        <p class="site-lead mx-auto" v-if="lead">{{ lead }}</p>
    </div>
</template>

<script setup lang="ts">
defineProps<{header?: string; lead?: string}>()
</script>
