<template>
    <div :class="{'site-page': !loggedIn}">
        <div class="site-glow site-glow-top" v-if="!loggedIn"></div>
        <v-container class="text-center" fluid>
            <div class="text-left" :class="{'home-wrapper': !loggedIn}">
                <site-header v-if="!loggedIn" header="FAQ" />
                <h1 v-else>FAQ</h1>

                <v-text-field v-model="searchValue" :loading="loading" @update:model-value="debounceSearch" label="Strautomator FAQ search" class="mt-2" rounded variant="outlined"></v-text-field>

                <div class="text-center text-caption mt-n4">Use the field above to search by keywords.</div>
                <div class="text-center text-caption mb-6">If you're interested you can also view the <nuxt-link to="/changelog" title="Strautomator updates">changelog</nuxt-link>.</div>
                <div v-for="group in groupedQuestions" :key="group.title">
                    <h2 :class="loggedIn ? 'mb-1 ml-1' : 'site-subheading mt-6 mb-2'">{{ group.title }}</h2>
                    <v-alert class="ma-0" v-if="groupedQuestions[0].questions.length == 0">No results found.</v-alert>
                    <v-expansion-panels class="mb-4" v-model="expandedPanels" multiple hover>
                        <v-expansion-panel v-for="(item, index) in group.questions" :key="'faq-' + index">
                            <v-expansion-panel-title>
                                <div v-html="highlightText(item.question)"></div>
                            </v-expansion-panel-title>
                            <v-expansion-panel-text>
                                <div v-html="highlightText(item.answer)"></div>
                            </v-expansion-panel-text>
                        </v-expansion-panel>
                    </v-expansion-panels>
                </div>
                <div class="text-center text-md-left">Still can't find what you're looking for? Drop an email to <a href="mailto:info@strautomator.com" title="Email support">info@strautomator.com</a>.</div>

                <div class="mt-10 text-center" v-if="!loggedIn">
                    <buttons-connect-strava />
                </div>

                <div class="mt-10 mb-4 text-center" title="Back to Strautomator home..." v-if="!loggedIn">
                    <v-btn color="primary" @click="backHome" rounded>
                        <v-icon start>mdi-home</v-icon>
                        Back to home
                    </v-btn>
                </div>

                <feature-links />
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

interface FaqCategory {
    tag: string
    title: string
}

interface FaqItem {
    question: string
    answer: string
    tags: string
}

const categories: FaqCategory[] = [
    {tag: "about", title: "About"},
    {tag: "security", title: "Security and privacy"},
    {tag: "subscription", title: "Free vs. PRO"},
    {tag: "automations", title: "Automations"},
    {tag: "gearwear", title: "GearWear"},
    {tag: "calendar", title: "Calendar"},
    {tag: "records", title: "Personal records"},
    {tag: "performance", title: "Performance estimation"},
    {tag: "ai", title: "AI integration"},
    {tag: "garmin", title: "Garmin integration"},
    {tag: "wahoo", title: "Wahoo integration"},
    {tag: "spotify", title: "Spotify integration"},
    {tag: "issues", title: "Common issues"}
]

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
const api = useApi()
const webError = useWebError()

const loading = ref(true)
const faq = ref<FaqItem[]>([])
const expandedPanels = ref<number[]>([])
const searchValue = ref("")
const searchQuery = ref("")
const loggedIn = computed(() => !!(store.oauth && store.user))

const groupedQuestions = computed(() => {
    const results: {title: string; questions: FaqItem[]}[] = []
    const query = searchValue.value.trim()

    if (query.length >= 2) {
        const escapedQuery = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp(escapedQuery, "i")
        const filterTitle = (item: FaqItem) => item.question.search(regex) >= 0
        const filterContent = (item: FaqItem) => item.tags.indexOf(query) >= 0 || item.answer.search(regex) >= 0
        const questions = _.filter(faq.value, filterTitle).concat(_.filter(faq.value, filterContent))
        results.push({title: `Search results: ${query}`, questions: _.uniqBy(questions, "question")})
    } else {
        for (let category of categories) {
            const questions = _.filter(faq.value, (q) => q.tags.indexOf(category.tag) == 0)
            results.push({title: category.title, questions: questions})
        }
    }

    return results
})

/**
 * Load FAQ entries and apply URL query options.
 */
const loadFaq = async () => {
    try {
        faq.value = await api("/api/help/faq")

        if (route.query) {
            if (route.query.q) {
                searchValue.value = decodeURIComponent(route.query.q.toString())
                searchQuery.value = searchValue.value
            }
            if (route.query.expand) {
                expandedPanels.value = [...Array(999).keys()]
            }
        }
    } catch (ex) {
        webError("FAQ.fetch", ex)
    }

    loading.value = false
}

const backHome = () => (document.location.href = "/home")

/**
 * Highlight the active FAQ search query in the passed text.
 */
const highlightText = (text: string) => {
    if (searchQuery.value.length < 2) {
        return text
    }

    const escapedQuery = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const iQuery = new RegExp("\\b " + escapedQuery + " \\b", "ig")
    return text.replace(iQuery, (matchedTxt) => " <span class='search-highlight'>" + matchedTxt.trim() + "</span> ")
}

const debounceSearch = _.debounce(async () => {
    loading.value = true
    searchQuery.value = searchValue.value
    expandedPanels.value = []
    loading.value = false
}, 600)

/**
 * Show Chatbase's floating help widget on the FAQ page.
 */
const initChatbase = () => {
    const win = window as any
    if (!win.chatbase || win.chatbase("getState") !== "initialized") {
        win.chatbase = (...args: any[]) => {
            if (!win.chatbase.q) {
                win.chatbase.q = []
            }
            win.chatbase.q.push(args)
        }
        win.chatbase = new Proxy(win.chatbase, {
            get(target, prop) {
                if (prop === "q") {
                    return target.q
                }
                return (...args: any[]) => target(prop, ...args)
            }
        })

        const onLoad = () => {
            const script = document.createElement("script")
            script.src = "https://www.chatbase.co/embed.min.js"
            script.id = "neTz5lyyofpBTh8BNF1kf"
            script.setAttribute("domain", "www.chatbase.co")
            document.body.appendChild(script)
        }
        if (document.readyState === "complete") {
            onLoad()
        } else {
            window.addEventListener("load", onLoad)
        }
    } else {
        setChatbaseVisibility("visible")
    }
}

const setChatbaseVisibility = (visibility: "visible" | "hidden") => {
    for (const id of ["chatbase-bubble-window", "chatbase-bubble-button", "chatbase-message-bubbles"]) {
        const element = document.getElementById(id)
        if (element) {
            element.style.visibility = visibility
        }
    }
}

onMounted(() => {
    loadFaq()
    initChatbase()
})

onBeforeUnmount(() => setChatbaseVisibility("hidden"))
</script>
