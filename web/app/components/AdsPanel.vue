<template>
    <div class="mt-6 mb-2 text-center" v-if="!hidden">
        <v-card class="mr-3 ml-3">
            <v-card-title class="bg-accent pt-1 text-body-1">Partner stores and services</v-card-title>
            <v-card-text class="bg-grey-lighten-2">
                <v-row>
                    <v-col :cols="12 / links.length" v-for="link in links" :key="`affiliate-${link.id}`">
                        <a :href="link.url" :target="link.id" :title="link.title">
                            <v-img :src="'https://links.strautomator.com/images/' + link.id + '.png'" max-height="64px" class="mt-1" :alt="link.title" @error="adFailed" v-if="failCount < links.length" />
                            <span class="font-weight-bold text-md-h3" v-else>{{ link.title }}</span>
                        </a>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

interface AffiliateLink {
    id: string
    title: string
    url: string
    country?: string[]
}

const affiliates: AffiliateLink[] = [
    {id: "365rider", title: "365 Rider", url: "https://links.strautomator.com/l/365rider"},
    {id: "aliexpress", title: "AliExpress", url: "https://links.strautomator.com/l/aliexpress-cycling-components"},
    {id: "decathlon", title: "Decathlon", url: "https://links.strautomator.com/l/decathlon", country: ["AT", "DE", "GB", "IT", "IE", "UK"]},
    {id: "ican", title: "ICAN", url: "https://links.strautomator.com/l/ican"},
    {id: "nextdns", title: "NextDNS", url: "https://links.strautomator.com/l/nextdns"},
    {id: "ribble", title: "Ribble", url: "https://links.strautomator.com/l/ribble", country: ["AT", "DE", "GB", "IE", "IM", "UK"]},
    {id: "tredz", title: "Tredz", url: "https://links.strautomator.com/l/tredz", country: ["GB", "IE", "UK"]},
    {id: "authenticfeet", title: "Authentic Feet", url: "https://links.strautomator.com/l/authenticfeet", country: ["BR"]}
]

const store = useMainStore()
const route = useRoute()
const {mdAndUp} = useDisplay()

const failCount = ref(0)
const links = ref<AffiliateLink[]>([])

const hidden = computed(() => {
    const urls = ["/billing/"]
    const hiddenUrl = urls.find((u) => route.path.includes(u))
    return hiddenUrl || (store.user?.isPro && !store.user?.preferences?.showAds)
})

/**
 * Refresh the list of affiliate links to be displayed.
 */
const refreshLinks = () => {
    failCount.value = 0
    const country = store.country
    const filtered = affiliates.filter((a) => !a.country || a.country.includes(country))
    links.value = _.sortBy(_.sampleSize(filtered, mdAndUp.value ? 3 : 2), "id")
}

const adFailed = () => failCount.value++

watch(
    () => route.path,
    (newPath) => {
        if (!hidden.value && newPath) {
            refreshLinks()
        }
    }
)

onMounted(() => setTimeout(refreshLinks, 10))
</script>
