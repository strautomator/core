<template>
    <div>
        <v-table class="activity-table" :density="mdAndUp ? 'default' : 'compact'">
            <thead :class="{'bg-accent': header}" v-if="mdAndUp">
                <tr>
                    <th></th>
                    <th>Original activity</th>
                    <th>Automations</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="activity in activities" :key="activity.id">
                    <td width="1" class="text-center table-align-top pr-0 pt-4">
                        <v-icon>{{ getSportIcon(activity.sportType) }}</v-icon>
                    </td>
                    <td class="pt-2 pb-2 table-align-top" :class="{'text-no-wrap': mdAndUp}">
                        <template v-if="!mdAndUp">
                            <div class="text-caption float-right text-right ml-2">
                                {{ getDate(activity).format("ll") }}<br />
                                {{ getDate(activity).format("LT") }}
                                {{ activity.totalTime ? "- " + getDate(activity).add(activity.totalTime, "seconds").format("LT") : "" }}
                            </div>
                            <a class="font-weight-bold" :href="`https://www.strava.com/activities/${activity.id}`" :title="`Open activity ${activity.id} on Strava`" target="strava">{{ activity.name || "Activity *" }}</a>
                            <div v-for="(recipe, id) in activity.recipes" :class="{'text-decoration-line-through text-grey': !user.recipes[id]}" :key="`${activity.id}-rs-${id}`">
                                {{ recipe.title }}
                            </div>
                            <div class="mt-1 ml-n1">
                                <v-chip class="mb-1 mr-1" v-for="(value, propName) in activity.updatedFields" :title="value" :key="`${activity.id}-fs-${propName}`" size="small">{{ getFriendlyUpdatedField(String(propName)) }}</v-chip>
                                <v-chip class="mb-1" v-if="activity.linkback || activity.backlink" title="Link to strautomator.com" size="small">Backlink</v-chip>
                                <v-chip class="mb-1" v-if="isActivityRecord(activity)" title="PR" size="small"><v-icon class="mr-1" size="small">mdi-medal</v-icon>PR</v-chip>
                            </div>
                        </template>
                        <template v-else>
                            <a class="font-weight-bold" :href="`https://www.strava.com/activities/${activity.id}`" :title="`Open activity ${activity.id} on Strava`" target="strava">{{ activity.name || "Activity *" }}</a>
                            <v-icon class="ml-1" v-if="isActivityRecord(activity)" size="x-small">mdi-medal</v-icon>
                            <br />
                            {{ getDate(activity).format("lll") }}
                            {{ activity.totalTime ? "- " + getDate(activity).add(activity.totalTime, "seconds").format("LT") : "" }}
                        </template>
                    </td>
                    <td class="pt-2 pb-2" v-if="mdAndUp" nowrap>
                        <div v-for="(recipe, id) in activity.recipes" :key="`${activity.id}-rm-${id}`">
                            <span :class="{'text-decoration-line-through text-grey': !user.recipes[id]}">{{ recipe.title }}</span>
                        </div>
                    </td>
                    <td class="pt-2 pb-2" v-if="mdAndUp">
                        <v-chip class="mb-1 mr-1" v-for="(value, propName) in activity.updatedFields" :title="value" :key="`${activity.id}-fm-${propName}`" size="small">{{ getFriendlyUpdatedField(String(propName)) }}</v-chip>
                        <v-chip class="mb-1" v-if="activity.linkback || activity.backlink" title="Link to strautomator.com" size="small">Backlink</v-chip>
                        <v-chip class="mb-1" v-if="isActivityRecord(activity)" title="PR" size="small"><v-icon class="mr-1" size="small">mdi-medal</v-icon>PR</v-chip>
                    </td>
                </tr>
            </tbody>
        </v-table>
        <v-divider />
        <div class="mt-2 mb-2 ml-5 mr-5 text-center text-md-left">
            Missing something?
            <br v-if="!mdAndUp" />
            Try the <nuxt-link to="/activities/recent" title="Try your automations with a specific activity">manual activity sync</nuxt-link>.
        </div>
        <v-alert color="accent" class="text-caption mt-4 text-center text-md-left ma-4 pa-2" v-if="user?.preferences.privacyMode">Privacy mode is enabled, some details about your processed activities and personal records won't be saved!</v-alert>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    activities: any[]
    header?: boolean
}>()

const {mdAndUp} = useDisplay()
const {user} = useUser()
const {getSportIcon, getFriendlyUpdatedField, isActivityRecord} = useStrava()
const {$dayjs}: any = useNuxtApp()

/**
 * Get the local display date for the activity.
 */
const getDate = (activity: any) => {
    const aDate = $dayjs(activity.dateStart || activity.dateProcessed)

    // Always display local activity times!
    if (activity.utcStartOffset) {
        aDate.utcOffset(activity.utcStartOffset)
    }

    return aDate
}
</script>
