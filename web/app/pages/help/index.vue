<template>
    <div :class="{'site-page': !loggedIn}">
        <div class="site-glow site-glow-top" v-if="!loggedIn"></div>
        <v-container class="text-center" fluid>
            <div :class="{'home-wrapper': !loggedIn, 'text-left': loggedIn}">
                <site-header v-if="!loggedIn" header=" Help" lead="Ask our AI assistant anything about Strautomator, or browse the FAQ." />
                <h1 v-else>Help</h1>

                <div :class="{'site-card pa-0 overflow-hidden': !loggedIn}">
                    <iframe frameborder="0" src="https://www.chatbase.co/neTz5lyyofpBTh8BNF1kf/help" style="display: block; width: 100%; min-height: 650px"></iframe>
                </div>

                <feature-links />
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
definePageMeta({
    layout: "landing",
    middleware: [
        () => {
            const store = useMainStore()
            setPageLayout(store.oauth && store.user ? "default" : "landing")
        }
    ]
})
useHead({title: "Help"})

const store = useMainStore()
const route = useRoute()
const webError = useWebError()

const loading = ref(false)
const streaming = ref(false)
const message = ref("")
const answer = ref<string>(null)
const loggedIn = computed(() => !!(store.oauth && store.user))

/**
 * Get the chat answer for the current message.
 */
const getAnswer = async () => {
    try {
        loading.value = true

        const body = JSON.stringify({message: message.value}, null, 0)
        const response = await fetch("/api/help/chat", {body, method: "POST", headers: {"Content-Type": "application/json"}})
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        answer.value = ""

        streaming.value = true
        while (streaming.value) {
            const {done, value} = await reader.read()
            if (done) {
                streaming.value = false
            } else {
                answer.value += decoder.decode(value)
            }
        }
    } catch (ex) {
        webError("Help.getAnswer", ex)
    } finally {
        loading.value = false
        streaming.value = false
    }
}

onMounted(() => {
    try {
        if (route.query?.q) {
            message.value = decodeURIComponent(route.query.q.toString())
            getAnswer()
        }
    } catch (ex) {
        webError("Help.fetch", ex)
    }
})
</script>
