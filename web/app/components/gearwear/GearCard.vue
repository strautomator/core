<template>
    <v-card class="mb-5" variant="outlined">
        <v-hover v-slot="{isHovering, props: hoverProps}">
            <nuxt-link v-bind="hoverProps" :to="canEdit ? '/gear/edit?id=' + gear.id : '/gear'" :title="`Edit GearWear for ${gear.name}`">
                <v-card-title class="bg-accent text-wrap">
                    <v-icon class="ml-n1 mr-2" color="primary">{{ gearIcon }}</v-icon>
                    <v-icon class="ml-n1 mr-2" color="primary" v-if="gear.primary">mdi-bookmark</v-icon>
                    <span>{{ gear.name }}</span>
                    <v-icon class="ml-2" color="secondary" v-if="route.query.new == gear.id">mdi-new-box</v-icon>
                    <v-icon class="ml-2" v-show="isHovering && canEdit" size="small">mdi-pencil-outline</v-icon>
                    <v-spacer></v-spacer>
                    <v-chip color="removal" title="This GearWear configuration is disabled" v-if="gearwearConfig?.disabled" size="small">DISABLED</v-chip>
                </v-card-title>
            </nuxt-link>
        </v-hover>
        <v-card-text class="pb-0 text-white">
            <div class="mt-1 mb-3">
                <v-container class="ma-0 pa-0" v-if="gearwearConfig" fluid>
                    <v-row no-gutters>
                        <v-col cols="12" :sm="12" :md="5">
                            <div class="font-weight-bold" v-if="gear.brand || gear.model">{{ gear.brand }} {{ gear.model }}</div>
                            <div>Total distance: {{ gear.distance }} {{ units }}</div>
                            <div v-if="gearwearConfig.lastUpdate?.date">Last update: {{ $dayjs(gearwearConfig.lastUpdate.date).format("ll") }}</div>
                            <div v-if="lastResetDetails">Last replacement: {{ lastResetDetails }}</div>
                        </v-col>
                        <v-col class="pt-2 pt-md-0" cols="12" :sm="12" :md="7">
                            <v-chip class="mr-3 ml-n1 mb-2" v-for="comp in gearwearConfig.components" :class="getChipClass(comp)" :color="getChipColor(comp)" :to="getChipLink(comp)" :key="gear.id + comp.name + 'sm'">
                                <v-icon class="mr-1" v-if="comp.disabled" size="small">mdi-sync-off</v-icon>
                                <v-icon class="mr-1" v-else-if="comp.currentDistance >= comp.alertDistance" size="small">mdi-sync</v-icon>
                                {{ getChipText(comp) }}
                            </v-chip>
                        </v-col>
                    </v-row>
                </v-container>
                <div v-else>
                    <div>
                        No configuration for this gear yet.
                        <br v-if="!mdAndUp" />
                        <nuxt-link v-if="gearwearRemaining > 0" :to="'/gear/edit?id=' + gear.id" :title="`Create GearWear for ${gear.name}`">Create one now?</nuxt-link>
                    </div>
                    <div>Total distance ≈ {{ gear.distance }} {{ units }}</div>
                    <div v-if="gear.lastUpdate">
                        Last update:
                        {{ $dayjs(gear.lastUpdate.date).format("MMM Do") }}
                        -
                        {{ gear.lastUpdate.distance }} {{ units }}, {{ getGearHours(gear.lastUpdate.time) }}h
                    </div>
                </div>
            </div>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
const props = defineProps<{
    gear: any
    gearwearConfig?: any
}>()

const route = useRoute()
const {mdAndUp} = useDisplay()
const {user, getGearwearRemaining} = useUser()
const {getGearIcon, getGearHours} = useGearwear()

const units = computed(() => (user.value?.profile.units == "imperial" ? "mi" : "km"))
const gearwearRemaining = computed(() => getGearwearRemaining(useMainStore().gearwear))
const canEdit = computed(() => gearwearRemaining.value > 0 || props.gearwearConfig)
const gearIcon = computed(() => getGearIcon(props.gear))

const lastResetDetails = computed(() => {
    if (!props.gearwearConfig) return false

    let lastHistory: any = null
    let lastComp: any = null

    for (const comp of props.gearwearConfig.components) {
        if (comp.history) {
            for (const history of comp.history) {
                if (!lastHistory || lastHistory.date < history.date) {
                    lastHistory = history
                    lastComp = comp
                }
            }
        }
    }

    if (lastHistory) {
        const {$dayjs}: any = useNuxtApp()
        const date = $dayjs(lastHistory.date).format("ll")
        return `${lastComp.name} on ${date}`
    }

    return false
})

/**
 * Get the CSS class for a component chip.
 */
const getChipClass = (comp: any) => {
    if (comp.currentDistance >= comp.alertDistance * 1.2) return "font-weight-bold"
    if (comp.disabled) return "text-disabled"
    return ""
}

/**
 * Get the color for a component chip.
 */
const getChipColor = (comp: any) => {
    if (comp.alertDistance > 0 && comp.currentDistance >= comp.alertDistance) return "error"
    if (comp.alertHours > 0 && comp.currentHours >= comp.alertHours) return "error"
    if (comp.disabled) return "accent"
    return ""
}

/**
 * Get the display text for a component chip.
 */
const getChipText = (comp: any) => {
    if (mdAndUp.value) return `${comp.name} - ${comp.currentDistance} ${units.value}`
    return comp.name
}

/**
 * Get the link for a component chip.
 */
const getChipLink = (comp: any) => {
    const query = comp.currentDistance >= comp.alertDistance ? "reset" : "comp"
    return `/gear/edit?id=${props.gear.id}&${query}=${comp.name}`
}
</script>
