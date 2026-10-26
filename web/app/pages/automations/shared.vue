<template>
    <div>
        <v-container fluid>
            <h1>{{ selectedRecipe ? "Shared Automation" : "Shared Automations" }}</h1>
            <v-snackbar v-if="route.query.new" v-model="alertNew" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Shared automation "{{ route.query.new }}" created!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-if="route.query.deleted" v-model="alertDeleted" class="text-left" color="error" :timeout="5000" rounded location="bottom">
                Shared automation "{{ route.query.title }}" deleted!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-model="urlCopied" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Copied shared automation URL to the clipboard.
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <div v-if="loading">
                <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                Loading shared automation(s), please wait...
            </div>
            <div v-else-if="notFound">A shared automation with ID {{ route.query.id }} could not be found. Please double check the URL again, or ask the automation's owner for the correct link.</div>
            <div v-else-if="selectedRecipe">
                <v-card variant="outlined">
                    <v-card-title class="bg-accent">
                        <span>{{ selectedRecipe.title }}</span>
                    </v-card-title>
                    <v-card-text class="text-white pb-2 pt-4">
                        <recipes-conditions-actions-list :recipe="selectedRecipe" />
                    </v-card-text>
                </v-card>
                <v-alert class="mb-2 mt-2">
                    ID {{ selectedRecipe.id }}, created by <a target="strava" :href="'https://www.strava.com/athletes/' + selectedRecipe.userId">{{ selectedRecipe.userDisplayName }}</a>
                </v-alert>
                <div class="mt-5 text-center text-md-left">
                    <v-btn color="primary" title="Create a new automation like this one" :to="'/automations/edit?template=' + selectedRecipe.id" rounded>
                        <v-icon start>mdi-content-copy</v-icon>
                        Use this automation
                    </v-btn>
                </div>
            </div>
            <div v-else-if="sharedRecipes.length == 0">
                <template v-if="user.isPro">
                    <p>You have no shared automations.</p>
                    <p>To share an automation with other users, please use the <v-icon color="primary" size="small">mdi-share-variant</v-icon> icon on the bottom right of the automation panel.</p>
                </template>
                <template v-else>
                    <v-alert class="text-center text-md-left" border="top" border-color="primary">
                        <p>Automation sharing is available to PRO users only.</p>
                        <v-btn color="primary" to="/billing" title="Subscribe to get a PRO account!" rounded>
                            <v-icon start>mdi-credit-card</v-icon>
                            Subscribe to PRO
                        </v-btn>
                    </v-alert>
                </template>
                <div class="text-center text-md-left">
                    <v-btn class="mr-2" color="primary" title="Back to my automations" to="/automations" variant="outlined" size="small" rounded>
                        <v-icon start>mdi-arrow-left</v-icon>
                        Back to My Automations
                    </v-btn>
                </div>
            </div>
            <div v-else>
                <v-card class="mb-5" v-for="recipe in sharedRecipes" :key="recipe.id" variant="outlined">
                    <v-card-title class="bg-accent">
                        <span>{{ recipe.title }}</span>
                        <v-icon class="ml-2" color="secondary" v-if="route.query.new == recipe.id">mdi-new-box</v-icon>
                    </v-card-title>
                    <v-card-text class="text-white pb-2">
                        <div class="ml-4 mb-2 mt-2">ID: {{ recipe.id }}</div>
                        <recipes-conditions-actions-list :recipe="recipe" />
                        <div class="mt-4 mb-2">
                            <v-btn color="primary" title="Copy URL for sharing" @click="copyURL(recipe)" size="small" rounded>
                                <v-icon start>mdi-content-copy</v-icon>
                                Copy URL
                            </v-btn>
                            <v-btn color="removal" title="Delete this shared automation" class="ml-2" @click.stop="showDeleteDialog(recipe)" size="small" rounded variant="outlined">
                                <v-icon start>mdi-delete</v-icon>
                                Delete
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
                <v-alert class="mt-6 text-center text-md-left" v-if="user.isPro">To share more automations, use the <v-icon color="primary" size="small">mdi-share-variant</v-icon> icon on the bottom right of the automation card.</v-alert>
                <v-alert class="mt-6 text-center text-md-left" v-else>To share more automations, you'll need to <nuxt-link to="/billing" title="Get PRO">get PRO</nuxt-link> again.</v-alert>

                <div class="mt-4 text-center text-md-left">
                    <v-btn color="primary" title="Back to my automations" to="/automations" variant="outlined" size="small" rounded>
                        <v-icon start>mdi-arrow-left</v-icon>
                        Back to My Automations
                    </v-btn>
                </div>
            </div>

            <v-dialog v-if="deletingRecipe" v-model="deleteDialog" width="440" opacity="0.95">
                <v-card>
                    <v-toolbar color="removal">
                        <v-toolbar-title>Delete shared automation</v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-toolbar-items>
                            <v-btn icon="mdi-close" @click.stop="hideDeleteDialog"></v-btn>
                        </v-toolbar-items>
                    </v-toolbar>
                    <v-card-text>
                        <h3 class="mt-4">{{ deletingRecipe.title }}</h3>
                        <p class="mt-2">Are you sure you want to delete this shared automation? Users won't be able to copy it, but existing user automations based on this one won't be affected.</p>
                        <div class="text-right">
                            <v-spacer></v-spacer>
                            <v-btn class="mr-2" color="grey" title="Cancel, do not delete" @click.stop="hideDeleteDialog" variant="text" rounded>
                                <v-icon start>mdi-cancel</v-icon>
                                Cancel
                            </v-btn>
                            <v-btn color="removal" title="Confirm and delete automation" @click="deleteRecipe" rounded>
                                <v-icon start>mdi-check</v-icon>
                                Delete
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </v-dialog>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

useHead({title: "Automations"})

const api = useApi()
const route = useRoute()
const webError = useWebError()
const {user} = useUser()

const alertNew = ref(false)
const alertDeleted = ref(false)
const deleteDialog = ref(false)
const selectedRecipe = ref<any>(null)
const deletingRecipe = ref<any>(null)
const urlCopied = ref(false)
const notFound = ref(false)
const loading = ref(false)
const sharedRecipes = ref<any[]>([])

/**
 * Sort recipes and group their conditions for rendering.
 */
const setOrderedRecipes = (recipes: any[] = []) => {
    for (const recipe of recipes) {
        const conditions = _.sortBy(recipe.conditions, "property")
        recipe.groupedConditions = _.groupBy(conditions, "property")
    }
    sharedRecipes.value = _.sortBy(recipes, ["defaultFor", "order", "title"])
}

/**
 * Close all route-query and clipboard alerts.
 */
const closeAlert = () => {
    alertNew.value = false
    alertDeleted.value = false
    urlCopied.value = false
}

/**
 * Copy the public URL for a shared recipe.
 */
const copyURL = async (recipe: any) => {
    const targetPath = `/automations/shared?id=${recipe.id}`
    try {
        await navigator.clipboard.writeText(`${location.origin}${targetPath}`)
        urlCopied.value = true
    } catch (ex) {
        await navigateTo({path: targetPath})
    }
}

const showDeleteDialog = (recipe: any) => {
    deletingRecipe.value = recipe
    deleteDialog.value = true
}

const hideDeleteDialog = () => {
    deleteDialog.value = false
    deletingRecipe.value = null
}

/**
 * Delete the selected shared recipe.
 */
const deleteRecipe = async () => {
    const recipeId = deletingRecipe.value.id

    try {
        await api(`/api/shared-recipes/${user.value.id}/${recipeId}`, {method: "DELETE"})
    } catch (ex) {
        webError("SharedAutomations.deleteRecipe", ex)
    }

    deleteDialog.value = false
    deletingRecipe.value = null
    window.document.location.href = `/automations/shared?deleted=${recipeId}`
}

/**
 * Load either one shared recipe or the user's full shared recipe list.
 */
const loadSharedRecipes = async () => {
    loading.value = true

    try {
        let recipes: any[] = []

        if (route.query.id) {
            const sharedRecipe: any = await api(`/api/shared-recipes/${user.value.id}/${route.query.id}`)
            if (sharedRecipe?.id) {
                selectedRecipe.value = sharedRecipe
                recipes = [sharedRecipe]
            } else {
                notFound.value = true
            }
        } else {
            recipes = await api(`/api/shared-recipes/${user.value.id}`)
        }

        setOrderedRecipes(recipes)
    } catch (ex) {
        webError("SharedAutomations.fetch", ex)
    }

    loading.value = false
}

onMounted(() => {
    alertNew.value = !!route.query.new
    alertDeleted.value = !!route.query.deleted
    loadSharedRecipes()
})
</script>
