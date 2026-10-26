<template>
    <v-card>
        <v-toolbar color="primary">
            <v-toolbar-title>Action</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
                <v-btn icon="mdi-close" @click="cancel"></v-btn>
            </v-toolbar-items>
        </v-toolbar>
        <v-card-title class="text-h5">Do the following...</v-card-title>
        <v-card-text>
            <v-form v-model="valid" ref="form">
                <v-container class="ma-0 pa-0" fluid>
                    <v-row no-gutters>
                        <v-col cols="12">
                            <v-autocomplete v-model="selectedAction" label="Select an action" :items="recipeActions" item-title="text" @update:model-value="actionOnChange" density="compact" variant="outlined" rounded return-object></v-autocomplete>
                            <template v-if="selectedAction">
                                <div v-if="selectedAction?.value == 'commute'">
                                    <v-select label="Commute tag" v-model="selectedCommute" item-value="id" item-title="name" :items="booleanFlags" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="selectedAction?.value == 'trainer'">
                                    <v-select label="Trainer tag" v-model="selectedTrainer" item-value="id" item-title="name" :items="booleanFlags" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="selectedAction?.value == 'gear'">
                                    <v-select label="Select a gear" v-model="selectedGear" item-value="id" item-title="name" :items="gears" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="selectedAction?.value?.includes('GearComponent')">
                                    <v-select label="Select a component" v-model="selectedGearComponent" item-value="id" item-title="name" :items="gearComponents" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="selectedAction?.value == 'sportType'">
                                    <v-select label="Select a sport" v-model="selectedSportType" item-value="value" item-title="text" :items="sportTypes" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="selectedAction?.value == 'workoutType'">
                                    <v-select label="Select a workout type" v-model="selectedWorkoutType" item-value="value" item-title="title" :items="workoutTypes" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="selectedAction?.value == 'mapStyle'">
                                    <v-select label="Select a map style" v-model="selectedMapStyle" item-value="value" item-title="title" :items="mapStyles" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="actionIsAI">
                                    <v-checkbox
                                        v-if="!insightsCustomPrompt && selectedAction?.value == 'generateInsights'"
                                        title="Use a custom prompt"
                                        class="mt-0 pt-0"
                                        label="Use a custom prompt"
                                        v-model="insightsCustomPrompt"
                                        color="primary"
                                    ></v-checkbox>
                                    <v-select
                                        v-if="selectedAction?.value != 'generateInsights'"
                                        label="Select a humour"
                                        v-model="selectedAiHumour"
                                        item-value="value"
                                        item-title="text"
                                        :items="aiHumours"
                                        density="compact"
                                        variant="outlined"
                                        rounded
                                        return-object
                                    ></v-select>
                                    <v-textarea
                                        v-if="(insightsCustomPrompt && selectedAction?.value == 'generateInsights') || selectedAiHumour?.value == 'custom'"
                                        v-model="valueInput"
                                        height="100"
                                        label="Custom AI prompt to be appended"
                                        :maxlength="recipeMaxLength.actionValue"
                                        @keydown="inputKeyDown"
                                        density="compact"
                                        variant="outlined"
                                        rounded
                                        no-resize
                                    ></v-textarea>
                                </div>
                                <div v-else-if="selectedAction?.value == 'aiProcess'">
                                    <v-textarea
                                        v-model="valueInput"
                                        height="100"
                                        label="AI prompt to process the activity"
                                        placeholder="Enter your instructions to process the activity data here."
                                        :rules="actionRules"
                                        :maxlength="recipeMaxLength.actionValue"
                                        @keydown="inputKeyDown"
                                        density="compact"
                                        variant="outlined"
                                        rounded
                                        no-resize
                                    ></v-textarea>
                                    <div class="mt-n1 text-caption text-center">The AI will process the activity data based on your prompt. It can update any existing activity field (name, description, commute, map, tags, sport type,...)</div>
                                </div>
                                <div v-else-if="selectedAction?.value == 'webhook'">
                                    <div>
                                        <v-select label="HTTP method" v-model="webhookMethod" :items="['POST', 'GET']" density="compact" variant="outlined" rounded></v-select>
                                    </div>
                                    <div>
                                        <v-text-field label="Webhook URL" placeholder="https://" v-model="webhookUrl" :rules="webhookActionRules" density="compact" variant="outlined" rounded></v-text-field>
                                    </div>
                                </div>
                                <div v-else-if="selectedAction?.value && !booleanActions.includes(selectedAction?.value)">
                                    <tag-autocomplete
                                        v-model="valueInput"
                                        textarea
                                        :items="activityTags"
                                        :style="actionIsDescription ? '' : 'overflow: hidden'"
                                        :height="actionIsDescription ? 160 : 30"
                                        :label="actionIsDescription ? 'Notes...' : selectedAction?.text"
                                        :rules="actionRules"
                                        :maxlength="recipeMaxLength.actionValue"
                                        @keydown="inputKeyDown"
                                        density="compact"
                                        variant="outlined"
                                        rounded
                                        no-resize
                                    >
                                        <template #item="{item}">
                                            <v-list-item-title>{{ item.value.substring(1, item.value.length - 1) }}</v-list-item-title>
                                            <v-list-item-subtitle>{{ getChipText(item) }}</v-list-item-subtitle>
                                        </template>
                                    </tag-autocomplete>
                                </div>
                                <div v-if="actionIsText" class="mt-n1 text-caption text-center text-md-left">
                                    Type $ to display the available activity tags, then keep typing to search for the desired tag.
                                    <br />
                                    Example: ${distance} ${speedAvg} ${totalTime}
                                </div>
                                <div class="text-center mb-2 mt-n2" v-if="actionIsAI">
                                    You can test and try some AI features
                                    <a href="/activities/fortune" title="Fortune cookies (aka. AI name and poem generator)" target="activityFortune">here</a>.
                                </div>
                            </template>
                        </v-col>
                    </v-row>
                    <v-row no-gutters>
                        <v-col class="mt-4 text-center" cols="12">
                            <v-btn color="primary" @click="save" title="Save this action" :disabled="!selectedAction?.value" rounded>
                                <v-icon start>mdi-check</v-icon>
                                Save action
                            </v-btn>
                        </v-col>
                    </v-row>
                    <v-row v-if="actionIsText" no-gutters>
                        <v-col class="text-center mt-4" cols="12">
                            <v-btn v-if="!showTags" @click="showTags = true" title="View all available tags" rounded size="x-small">
                                <v-icon start>mdi-chevron-down</v-icon>
                                View all tags
                            </v-btn>
                            <v-card v-else>
                                <v-card-text class="pa-0 ma-0">
                                    <h4 class="mb-1">Available tags</h4>
                                    <div style="max-height: 140px" class="overflow-y-auto">
                                        <v-chip v-for="tag in activityTags" :key="tag.value" @click="addTag(tag.value)" :title="getChipText(tag)" :size="mdAndUp ? 'small' : 'x-small'" class="ml-1 mr-1 mb-1">
                                            {{ tag.value.substring(1, tag.value.length - 1) }}
                                        </v-chip>
                                    </div>
                                </v-card-text>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-container>
            </v-form>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import _ from "lodash"

type SelectItem = Record<string, any>

const props = withDefaults(defineProps<{disabledActions?: string[]}>(), {disabledActions: () => []})
const emit = defineEmits<{closed: [value: any | false]}>()

const store = useMainStore()
const {mdAndUp} = useDisplay()
const {user} = useUser()
const {getSportName} = useStrava()
const {mainActivityTags, extraActivityTags, booleanActions, recipeRules} = useRecipe()
const recipeMaxLength = computed(() => store.recipeMaxLength || {})

const form = ref<any>(null)
const valid = ref(true)
const recipeActions = ref<SelectItem[]>([])
const selectedAction = ref<SelectItem | null>(null)
const selectedCommute = ref<SelectItem | null>(null)
const selectedTrainer = ref<SelectItem | null>(null)
const selectedGear = ref<SelectItem | null>(null)
const selectedGearComponent = ref<SelectItem | null>(null)
const selectedSportType = ref<SelectItem | null>(null)
const selectedWorkoutType = ref<SelectItem | null>(null)
const selectedMapStyle = ref<SelectItem | null>(null)
const selectedAiHumour = ref<SelectItem | null>(null)
const insightsCustomPrompt = ref(false)
const webhookMethod = ref("POST")
const webhookUrl = ref("")
const booleanFlags = ref<SelectItem[]>([])
const gears = ref<SelectItem[]>([])
const gearComponents = ref<SelectItem[]>([])
const sportTypes = ref<SelectItem[]>([])
const workoutTypes = ref<SelectItem[]>([])
const mapStyles = ref<SelectItem[]>([])
const aiHumours = ref<SelectItem[]>([])
const showTags = ref(false)
const valueInput = ref("")

const activityTags = computed(() => (mainActivityTags ? _.concat(mainActivityTags, extraActivityTags) : []))
const actionRules = computed(() => (selectedAction.value?.value != "webhook" ? [recipeRules.required] : []))
const webhookActionRules = computed(() => (selectedAction.value?.value == "webhook" ? [recipeRules.required, recipeRules.url] : []))
const actionIsDescription = computed(() => selectedAction.value && ["description", "prependDescription", "appendDescription", "privateNote"].includes(selectedAction.value?.value))
const actionIsText = computed(
    () => selectedAction.value && ["name", "prependName", "appendName", "description", "prependDescription", "appendDescription", "privateNote", "prependPrivateNote", "appendPrivateNote"].includes(selectedAction.value?.value)
)
const actionIsAI = computed(() => selectedAction.value && ["generateName", "generateDescription", "generateInsights"].includes(selectedAction.value?.value))

watch(
    () => props.disabledActions,
    (arr) => filterActions(arr || [])
)

/**
 * Builds the action list, disabling PRO-only and conflicting actions.
 */
const filterActions = (disabledActions: string[] = []) => {
    const currentUser = store.user
    const actions = _.cloneDeep(store.recipeActions)

    // Disable PRO-only actions if user is not PRO.
    if (!currentUser.isPro) {
        actions.forEach((ac: any) => {
            if (ac.isPro) {
                ac.text += " (PRO only)"
                ac.disabled = true
            }
        })
    }

    const arr = _.cloneDeep(disabledActions)

    // Make sure we disable related actions that were already set.
    if (arr.includes("name")) arr.push("generateName", "prependName", "appendName")
    if (arr.includes("prependName")) arr.push("name")
    if (arr.includes("appendName")) arr.push("name")
    if (arr.includes("description")) arr.push("generateDescription", "prependDescription", "appendDescription")
    if (arr.includes("prependDescription")) arr.push("description")
    if (arr.includes("appendDescription")) arr.push("description")
    if (arr.includes("privateNote")) arr.push("prependPrivateNote", "appendPrivateNote")
    if (arr.includes("prependPrivateNote")) arr.push("privateNote")
    if (arr.includes("appendPrivateNote")) arr.push("privateNote")

    // Iterate actions already set for the current automation recipe.
    for (const existingAction of _.uniq(arr)) {
        const item = _.find(actions, {value: existingAction})
        if (item) item.disabled = true
    }

    recipeActions.value = actions
    return actions
}

/**
 * Build the initial state for this dialog.
 */
const resetData = () => {
    filterActions(props.disabledActions)

    const flags = [
        {id: true, name: "Yes"},
        {id: false, name: "No"}
    ]

    const bikes = _.cloneDeep(store.user.profile.bikes || [])
    for (const bike of bikes) bike.name = `${bike.name} (bike)`
    const shoes = _.cloneDeep(store.user.profile.shoes || [])
    for (const shoe of shoes) shoe.name = `${shoe.name} (shoes)`
    const allGears = _.concat([{id: "none", name: "None"}], bikes, shoes)

    const components: SelectItem[] = []
    for (const gearwearConfig of Object.values(store.gearwear || {}) as any[]) {
        gearwearConfig.components?.forEach((component: any) => components.push({id: `${gearwearConfig.id}: ${component.name}`, name: `${gearwearConfig.name} - ${component.name}`}))
    }
    if (components.length == 0) {
        const enableAction = _.find(recipeActions.value, {value: "enableGearComponent"})
        const disableAction = _.find(recipeActions.value, {value: "disableGearComponent"})
        if (enableAction) enableAction.disabled = true
        if (disableAction) disableAction.disabled = true
    }

    const sports = store.sportTypes.map((sportType: string) => ({value: sportType, text: getSportName(sportType)}))
    const humours: SelectItem[] = _.cloneDeep(store.aiHumours).map((humour: string) => ({value: humour, text: humour.charAt(0).toUpperCase() + humour.slice(1)}))
    humours.unshift({value: "", text: "Random"})
    humours.push({value: "custom", text: `Use a custom prompt${!store.user.isPro ? " (PRO only)" : ""}`, disabled: !store.user.isPro})

    valid.value = true
    selectedAction.value = null
    selectedCommute.value = flags[0]
    selectedTrainer.value = flags[0]
    selectedGear.value = null
    selectedGearComponent.value = null
    selectedSportType.value = null
    selectedWorkoutType.value = null
    selectedMapStyle.value = null
    selectedAiHumour.value = humours[0]
    insightsCustomPrompt.value = false
    webhookMethod.value = "POST"
    webhookUrl.value = ""
    booleanFlags.value = flags
    gears.value = allGears
    gearComponents.value = components
    sportTypes.value = sports
    workoutTypes.value = _.cloneDeep(store.workoutTypes)
    mapStyles.value = _.cloneDeep(store.mapStyles)
    aiHumours.value = humours
    showTags.value = false
    valueInput.value = ""
}

/**
 * Returns the label shown for an activity tag.
 */
const getChipText = (tag: any) => (tag.pro && !user.value.isPro ? `${tag.text || tag.label} - PRO only` : tag.text || tag.label)

/**
 * Remove line breaks from single-line text actions.
 */
const actionOnChange = () => {
    if (!actionIsDescription.value && actionIsText.value && valueInput.value) {
        valueInput.value = valueInput.value.replace(/(?:\r\n|\r|\n)/g, " ")
    }
}

/**
 * Prevent Enter on single-line text actions.
 */
const inputKeyDown = (event: KeyboardEvent) => {
    if (!actionIsDescription.value && event.key == "Enter") {
        event.preventDefault()
        return false
    }
}

/**
 * Close the dialog without saving.
 */
const cancel = () => {
    emit("closed", false)
    window.setTimeout(resetData, 500)
}

/**
 * Check whether the form is valid.
 */
const validateForm = async (): Promise<boolean> => {
    const result = await form.value?.validate()
    return typeof result == "boolean" ? result : !!result?.valid
}

/**
 * Save the current action and close the dialog.
 */
const save = async () => {
    if (!(await validateForm())) return

    const result: any = {type: selectedAction.value?.value}

    if (result.type == "commute") {
        result.value = selectedCommute.value?.id
        result.friendlyValue = selectedCommute.value?.id ? "yes" : "no"
    } else if (result.type == "trainer") {
        result.value = selectedTrainer.value?.id
        result.friendlyValue = selectedTrainer.value?.id ? "yes" : "no"
    } else if (result.type == "gear") {
        result.value = selectedGear.value?.id
        result.friendlyValue = selectedGear.value?.name
    } else if (result.type.includes("GearComponent")) {
        result.value = selectedGearComponent.value?.id
        result.friendlyValue = selectedGearComponent.value?.name
    } else if (result.type == "sportType") {
        result.value = selectedSportType.value?.value
        result.friendlyValue = selectedSportType.value?.text
    } else if (result.type == "workoutType") {
        result.value = selectedWorkoutType.value?.value
        result.friendlyValue = selectedWorkoutType.value?.text || selectedWorkoutType.value?.title
    } else if (result.type == "mapStyle") {
        result.value = selectedMapStyle.value?.value
        result.friendlyValue = selectedMapStyle.value?.text || selectedMapStyle.value?.title
    } else if (result.type == "webhook") {
        const webhookValue = `${webhookMethod.value} ${webhookUrl.value}`
        result.value = webhookValue
        result.friendlyValue = webhookValue
    } else if (actionIsAI.value && (!selectedAiHumour.value || selectedAiHumour.value?.value != "random")) {
        if (valueInput.value && (result.type == "generateInsights" || selectedAiHumour.value?.value == "custom")) {
            const prompt = valueInput.value.trim()
            result.value = "custom:" + prompt
            result.friendlyValue = "custom prompt: " + prompt
        } else {
            result.value = selectedAiHumour.value?.value
            result.friendlyValue = result.type == "generateInsights" ? "Default" : selectedAiHumour.value?.text
        }
    } else if (result.type == "aiProcess") {
        if (!valueInput.value?.trim()) return
        result.value = valueInput.value.trim()
        result.friendlyValue = result.value
    } else {
        result.value = valueInput.value || true
    }

    emit("closed", result)
    resetData()
}

/**
 * Append a tag chip to the action value.
 */
const addTag = (tag: string) => {
    valueInput.value += "$" + tag
}

resetData()
</script>
