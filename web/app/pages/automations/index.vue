<template>
    <div>
        <v-container fluid>
            <h1>
                Automations
                <v-btn v-if="recipesRemaining > 0" class="float-right mt-3 ml-3 text-h6 font-weight-bold" color="primary" to="/automations/edit" title="Create a new automation" size="32" icon>+</v-btn>
                <v-btn class="float-right mt-3 text-h6 font-weight-bold" color="primary" to="/automations/history" title="Go to automation history" size="32" icon><v-icon size="small">mdi-history</v-icon></v-btn>
            </h1>
            <v-snackbar v-if="route.query.new" v-model="alertNew" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                New automation "{{ user.recipes[route.query.new as string]?.title || "" }}" created!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-if="route.query.updated" v-model="alertUpdated" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Automation "{{ user.recipes[route.query.updated as string]?.title || "" }}" updated!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-if="route.query.deleted" v-model="alertDeleted" class="text-left" color="error" :timeout="5000" rounded location="bottom">
                Automation "{{ route.query?.title || "" }}" deleted!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <div v-if="!recipes || recipes.length == 0">
                <recipes-create-first />
            </div>
            <div v-else>
                <user-automations />
                <v-alert class="mt-6 text-center text-md-left">
                    <div>
                        Want to check what Strautomator has updated for you in the past?
                        <br v-if="!mdAndUp" />
                        Go to the <nuxt-link to="/automations/history" title="Automation history">automation history.</nuxt-link>
                    </div>
                    <div class="mt-2 mt-md-0">
                        Want to test your automations with an activity?
                        <br v-if="!mdAndUp" />
                        Try a <nuxt-link to="/activities/recent" title="Manual automation trigger">manual processing.</nuxt-link>
                    </div>
                    <div class="mt-2 mt-md-0" v-if="user.isPro">
                        Want to see your shared automations?
                        <br v-if="!mdAndUp" />
                        You can <nuxt-link to="/automations/shared" title="Your shared automations">Check them here.</nuxt-link>
                    </div>
                </v-alert>
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Automations"})

const route = useRoute()
const {mdAndUp} = useDisplay()
const {user, recipesRemaining} = useUser()

const alertNew = ref(false)
const alertUpdated = ref(false)
const alertDeleted = ref(false)

const recipes = computed(() => Object.values(user.value.recipes))

/**
 * Close all route-query alerts.
 */
const closeAlert = () => {
    alertNew.value = false
    alertUpdated.value = false
    alertDeleted.value = false
}

onMounted(() => {
    alertNew.value = !!route.query.new
    alertUpdated.value = !!route.query.updated
    alertDeleted.value = !!route.query.deleted
})
</script>
