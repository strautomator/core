<template>
    <div>
        <VueDraggable v-model="recipes" handle=".drag-handle" draggable=".sortablerecipe" :animation="250" ghost-class="drag-ghost" @update="recipeReordered" @start="dragging = true" @end="dragEnd">
            <transition-group type="transition" :name="!dragging ? 'flip-list' : null">
                <v-card class="mb-5" :class="{sortablerecipe: !recipe.defaultFor}" v-for="(recipe, recipeIndex) in recipes" :key="recipe.id" variant="outlined">
                    <v-hover v-slot="{isHovering, props}">
                        <nuxt-link v-bind="props" :to="'/automations/edit?id=' + recipe.id" :title="recipe.title">
                            <v-card-title class="bg-accent">
                                <span>{{ recipe.title }}</span>
                                <v-icon class="ml-2" color="secondary" v-if="route.query.new == recipe.id">mdi-new-box</v-icon>
                                <v-icon class="ml-2" v-show="isHovering" size="small">mdi-pencil-outline</v-icon>
                                <v-spacer></v-spacer>
                                <v-chip class="mr-2" color="removal" title="This automation is disabled" v-if="isRecipeDisabled(recipe, recipeIndex)" size="small">DISABLED</v-chip>
                                <v-icon class="drag-handle ml-1" title="Hold to reorder this automation recipe" v-if="!recipe.defaultFor">mdi-drag</v-icon>
                            </v-card-title>
                        </nuxt-link>
                    </v-hover>
                    <v-card-text class="text-white pb-2">
                        <recipes-conditions-actions-list :recipe="recipe" />
                        <div class="mt-2 mb-2" v-if="recipe.killSwitch">
                            <v-chip class="mb-0 ml-1" color="removal" title="Stop processing further automations if this one is triggered" variant="outlined" size="small">STOP HERE</v-chip>
                        </div>
                        <v-btn v-if="user.isPro" class="font-weight-bold float-right mr-n1" color="primary" title="Share this automation" @click="shareRecipe(recipe)" size="small" variant="text" icon
                            ><v-icon size="small">mdi-share-variant</v-icon></v-btn
                        >
                        <div class="mt-2 mb-2 mb-md-0" v-if="recipeStats[recipe.id] && recipeStats[recipe.id].dateLastTrigger">
                            <v-chip class="mb-0 ml-1" disabled variant="outlined" size="small">Executed {{ recipeStats[recipe.id].activityCount }}+ times, last: {{ recipeStats[recipe.id].dateLastTrigger }}</v-chip>
                            <v-chip class="mb-0 ml-1 mt-1 mt-md-0" v-if="hasCounter(recipe)" disabled variant="outlined" size="small">Counter: {{ recipe.counterProp ? recipe.counterProp : "" }} {{ recipeStats[recipe.id].counter.toFixed(1) }}</v-chip>
                        </div>
                        <div v-else>
                            <v-chip class="mb-0 ml-1" disabled variant="outlined" size="small">Never executed before</v-chip>
                        </div>
                    </v-card-text>
                </v-card>
            </transition-group>
        </VueDraggable>
        <div class="mt-5 text-center text-md-left">
            <v-btn v-if="recipesRemaining > 0" color="primary" to="/automations/edit" title="Create a new automation" rounded>
                <v-icon start>mdi-plus-circle</v-icon>
                Create new automation
            </v-btn>
            <div v-else-if="recipesRemaining == 0">
                <v-alert border="top" border-color="primary">
                    <p>
                        You have reached the limit of {{ recipesMaxAllowed }} automations on your free account.
                        <br v-if="mdAndUp" />
                        To have unlimited automations and access to all the features, you'll need a PRO account.
                    </p>
                    <v-btn color="primary" to="/billing" title="Subscribe to get a PRO account!" rounded>
                        <v-icon start>mdi-credit-card</v-icon>
                        Subscribe to PRO
                    </v-btn>
                </v-alert>
            </div>
            <div v-else-if="recipesRemaining < 0">
                <v-alert border="top" border-color="error">
                    <p>
                        You are over the limit of {{ recipesMaxAllowed }} automations on the free account.
                        <br v-if="mdAndUp" />
                        Only the top {{ recipesMaxAllowed }} automations will work. If you want to keep using all of them, please upgrade to PRO.
                    </p>
                    <v-btn color="primary" to="/billing" title="Subscribe to get a PRO account!" rounded>
                        <v-icon start>mdi-credit-card</v-icon>
                        Subscribe to PRO
                    </v-btn>
                </v-alert>
            </div>
        </div>
    </div>
</template>

<style>
li.if-then {
    list-style-type: none;
    opacity: 0.4;
}
.action-list {
    list-style-type: disc;
}
.condition-list {
    list-style-type: circle;
}
.condition-list li.or {
    list-style-type: none;
}
.drag-handle {
    cursor: move;
    color: #f0f0f0;
}
.drag-ghost {
    opacity: 0.1;
}
</style>

<script setup lang="ts">
import _ from "lodash"
import dayjs from "dayjs"
import {VueDraggable} from "vue-draggable-plus"

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const route = useRoute()
const {mdAndUp} = useDisplay()
const {user, recipesRemaining, recipesMaxAllowed} = useUser()
const {shareRecipe} = useRecipe()

const hasChanges = ref(false)
const dragging = ref(false)
const recipeStats = ref<Record<string, any>>({})
const recipes = ref<any[]>([])
const delaySaveOrder = _.debounce(() => saveOrder(), 3000)

/**
 * Check whether a recipe is disabled by plan limits or its own flag.
 */
const isRecipeDisabled = (recipe: any, index: number) => (recipesRemaining.value < 0 && index >= recipesMaxAllowed.value) || recipe.disabled

/**
 * Check whether a recipe uses the counter tag.
 */
const hasCounter = (recipe: any) => recipeStats.value[recipe.id] && recipeStats.value[recipe.id].counter > 0 && _.find(recipe.actions, (action: any) => _.isString(action.value) && action.value.includes("${counter}"))

/**
 * Sort recipes and group their conditions for rendering.
 */
const setOrderedRecipes = (recipesToOrder?: any[]) => {
    const nextRecipes = recipesToOrder || recipes.value
    for (const recipe of nextRecipes) {
        const conditions = _.sortBy(recipe.conditions, "property")
        recipe.groupedConditions = _.groupBy(conditions, "property")
    }
    recipes.value = _.sortBy(nextRecipes, ["defaultFor", "order", "title"])
}

/**
 * Mark the list as changed after drag sorting.
 */
const recipeReordered = () => {
    hasChanges.value = true
    delaySaveOrder()
}

/**
 * Finish dragging and persist the new order.
 */
const dragEnd = () => {
    dragging.value = false
    recipeReordered()
}

/**
 * Save the current recipe order through the API.
 */
const saveOrder = async () => {
    if (!hasChanges.value) return
    hasChanges.value = false

    try {
        let index = 0
        const data: Record<string, number> = {}

        // Create object to update the order of recipes.
        for (const recipe of recipes.value) {
            index++
            recipe.order = index
            data[recipe.id] = index
            store.setUserRecipe(_.cloneDeep(recipe))
        }

        await api(`/api/users/${user.value.id}/recipes/order`, {method: "POST", body: data})
    } catch (ex) {
        webError("UserAutomations.saveOrder", ex)
    }
}

/**
 * Load recipe execution stats.
 */
const loadRecipeStats = async () => {
    try {
        const statsByRecipe: Record<string, any> = {}
        const arrStats: any[] = await api(`/api/users/${user.value.id}/recipes/stats`)

        for (const stats of arrStats) {
            const recipeId = stats.id.split("-")[1]
            if (stats.dateLastTrigger) {
                stats.dateLastTrigger = dayjs(stats.dateLastTrigger).format("ll")
            }
            statsByRecipe[recipeId] = stats
        }

        recipeStats.value = statsByRecipe
    } catch (ex) {
        webError("UserAutomations.fetch", ex)
    }
}

onMounted(() => {
    loadRecipeStats()
    setOrderedRecipes(_.cloneDeep(Object.values(user.value.recipes)))
})
</script>
