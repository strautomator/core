<template>
    <div>
        <v-container v-if="recipe" fluid>
            <h1>
                {{ recipe.id ? "Edit" : "New" }} automation
                <v-btn v-if="recipe.id || templateId" class="float-right mt-3 text-h6 font-weight-bold" color="primary" :title="asJson ? 'Switch to form' : 'Switch to JSON'" @click="toggleMode()" size="32" icon>
                    <v-icon size="small">{{ asJson ? "mdi-form-select" : "mdi-code-json" }}</v-icon>
                </v-btn>
            </h1>
            <v-form v-model="valid" class="mb-0" ref="form">
                <v-text-field v-model="recipe.title" :rules="[recipeRules.required]" label="Automation name" :maxlength="recipeMaxLength.title" @keyup="checkValid()" variant="outlined" rounded></v-text-field>
            </v-form>

            <template v-if="asJson">
                <v-card variant="outlined">
                    <v-card-title>Conditions and actions (JSON)</v-card-title>
                    <v-card-text :class="{'compact-editor': smAndDown}">
                        <client-only>
                            <JsonEditorVue v-model="jsonData" class="jse-theme-dark" :validator="validateJson" :indentation="smAndDown ? 2 : 4" />
                        </client-only>
                        <v-alert color="error" v-if="jsonErrors.length > 0" class="mt-4">
                            <div class="font-weight-bold">JSON validation errors</div>
                            <ul class="ml-n2">
                                <li v-for="(err, index) in jsonErrors" :key="`json-error-${index}`">{{ err.message }}.</li>
                            </ul>
                        </v-alert>

                        <div class="text-center text-md-left mt-4">
                            <v-btn color="primary" title="Save this automation" @click="showJsonSpecsDialog" size="small" rounded>
                                <v-icon start>mdi-help-circle</v-icon>
                                JSON Help
                            </v-btn>
                        </div>

                        <v-dialog v-model="jsonSpecsDialog" width="640" opacity="0.95" :fullscreen="smAndDown">
                            <v-card>
                                <v-toolbar color="primary">
                                    <v-toolbar-title>Automation JSON Help</v-toolbar-title>
                                    <v-spacer></v-spacer>
                                    <v-toolbar-items>
                                        <v-btn icon="mdi-close" @click.stop="hideJsonSpecsDialog"></v-btn>
                                    </v-toolbar-items>
                                </v-toolbar>
                                <v-card-text>
                                    <div class="mt-4">
                                        <p>The following rules apply to the automation JSON source:</p>
                                        <ul class="ml-n2">
                                            <li>Must have "defaultFor" or "conditions", but not both.</li>
                                            <li>Conditions must have the following fields: "property", "operator" and "value".</li>
                                            <li>Actions must have the following fields: "type" and "value".</li>
                                            <li>A "friendlyValue" can be added to conditions and actions to describe what it does.</li>
                                        </ul>
                                        <p class="mt-2">Below you'll find a list of all available condition properties and actions.</p>
                                        <v-autocomplete
                                            v-model="jsonSpecsItem"
                                            label="Condition properties and action types"
                                            :items="recipePropertiesActions"
                                            item-title="value"
                                            density="compact"
                                            variant="outlined"
                                            rounded
                                            return-object
                                        ></v-autocomplete>

                                        <v-alert color="accent" v-if="jsonSpecsItem" class="mt-n2">
                                            <div v-if="jsonSpecsItem.value == 'defaultFor'" class="text-subtitle-1 font-weight-bold">
                                                {{ jsonSpecsItem.text }}
                                            </div>
                                            <div v-else-if="jsonSpecsItem.operators">
                                                <div class="text-subtitle-1">
                                                    Property:
                                                    <span class="font-weight-bold">{{ jsonSpecsItem.text }}</span>
                                                </div>
                                                <div class="text-subtitle-1">
                                                    Value type:
                                                    <span class="font-weight-bold">{{ jsonSpecsItem.type }}</span>
                                                    <span v-if="jsonSpecsItem.type == 'time'">(HH:MM)</span>
                                                    <span v-else-if="jsonSpecsItem.type == 'location'">(lat, lon)</span>
                                                </div>
                                                <div class="mt-1 mb-1">Operators:</div>
                                                <ul class="ml-n2">
                                                    <li v-for="operator in jsonSpecsItem.operators" :key="operator.value">
                                                        <span class="font-weight-bold">{{ operator.value }}</span> - {{ operator.text }}
                                                    </li>
                                                </ul>
                                            </div>
                                            <div class="text-subtitle-1" v-else>
                                                Action: <span class="font-weight-bold">{{ jsonSpecsItem.text }}</span>
                                            </div>
                                            <v-select
                                                v-if="jsonSpecsItem.value == 'defaultFor' || jsonSpecsItem.type == 'sportType'"
                                                label="List of sport types"
                                                class="mt-4 mb-n4"
                                                :items="store.sportTypes"
                                                density="compact"
                                                variant="outlined"
                                                rounded
                                            ></v-select>
                                        </v-alert>
                                        <p>Further technical details can be found directly on <a href="https://github.com/strautomator/core/blob/master/src/recipes/lists.ts" target="github">GitHub</a>.</p>
                                    </div>
                                </v-card-text>
                            </v-card>
                        </v-dialog>
                    </v-card-text>
                </v-card>
            </template>
            <template v-else>
                <v-card variant="outlined">
                    <v-card-title>Conditions {{ recipe.disabled ? "(disabled)" : "" }}</v-card-title>
                    <v-card-text>
                        <div class="mb-3" v-if="recipe.defaultFor">
                            <v-container class="ma-0 pa-0 d-flex align-start" fluid>
                                <div class="mr-2">
                                    <v-icon color="removal" v-if="deleteItemSelected != recipe.defaultFor" @click="confirmDelete(recipe.defaultFor)">mdi-minus-circle-outline</v-icon>
                                    <v-icon v-if="deleteItemSelected == recipe.defaultFor" color="grey" @click="cancelDelete">mdi-cancel</v-icon>
                                </div>
                                <div class="mr-2" v-if="deleteItemSelected == recipe.defaultFor">
                                    <v-btn color="removal" @click="deleteCondition({defaultFor: recipe.defaultFor})" rounded size="x-small">Delete</v-btn>
                                </div>
                                <div>
                                    <span class="font-weight-bold">Default automation for all "{{ getSportName(recipe.defaultFor) }}" activities</span>
                                </div>
                            </v-container>
                        </div>
                        <template v-else-if="groupedConditions">
                            <div v-if="recipe.conditions.length > 1" class="mt-n1 mb-2">
                                <div v-if="codeLogicalOperator(recipe) == 'ALL'" class="if-then">If <strong>ALL</strong> these conditions are met:</div>
                                <div v-else-if="codeLogicalOperator(recipe) == 'ANY'" class="if-then">If <strong>ANY</strong> of these conditions are met:</div>
                                <div v-else-if="recipe.conditions.length > 2" class="if-then">If these conditions are met:</div>
                            </div>
                            <template v-for="(conditions, property, groupIndex) in groupedConditions" :key="property">
                                <v-chip v-if="codeLogicalOperator(recipe) == 'SOME' && groupIndex > 0" class="ml-7 mt-n1 mb-2" size="small" variant="outlined">{{ recipe.op }}</v-chip>
                                <div class="mb-3" v-for="(condition, index) in conditions" :key="`${property}-c-${index}`">
                                    <v-container class="ma-0 pa-0 d-flex align-start" fluid>
                                        <div class="mr-2">
                                            <v-icon color="removal" v-if="deleteItemSelected != condition" @click="confirmDelete(condition)">mdi-minus-circle-outline</v-icon>
                                            <v-icon v-if="deleteItemSelected == condition" color="grey" @click="cancelDelete">mdi-cancel</v-icon>
                                        </div>
                                        <div class="mr-2" v-if="deleteItemSelected == condition">
                                            <v-btn color="removal" @click="deleteCondition(condition)" rounded size="x-small">Delete</v-btn>
                                        </div>
                                        <div>
                                            <span v-if="codeLogicalOperator(recipe) == 'SOME' && index > 0">{{ recipe.samePropertyOp.toString().toLowerCase() }}</span>
                                            <span>{{ conditionSummary(condition) }}</span>
                                        </div>
                                    </v-container>
                                </div>
                            </template>
                        </template>
                        <v-alert class="mt-3 mb-2 text-body-2" color="accent" density="compact" v-if="needsDelay(recipe)">Some of these conditions might work best if the "Delayed processing" is enabled on your Account.</v-alert>
                        <div>
                            <v-btn class="ml-n3 mt-2" color="primary" title="Add a new condition" :disabled="!!recipe.defaultFor" @click.stop="showConditionDialog" rounded variant="text" size="small">
                                <v-icon class="mr-2">mdi-plus-circle</v-icon>
                                Add new condition
                            </v-btn>
                        </div>
                        <v-dialog v-model="conditionDialog" width="640" opacity="0.95" :fullscreen="smAndDown" persistent>
                            <recipes-add-condition @closed="setCondition" />
                        </v-dialog>
                    </v-card-text>
                </v-card>

                <v-card class="mt-4" variant="outlined">
                    <v-card-title>Actions {{ recipe.disabled ? "(disabled)" : "" }}</v-card-title>
                    <v-card-text>
                        <div class="mb-3" v-for="(action, index) in recipe.actions" :key="`action-${index}`">
                            <v-container class="ma-0 pa-0 d-flex align-start" fluid>
                                <div class="mr-2">
                                    <v-icon color="removal" v-if="deleteItemSelected != action" @click="confirmDelete(action)">mdi-minus-circle-outline</v-icon>
                                    <v-icon v-if="deleteItemSelected == action" color="grey" @click="cancelDelete">mdi-cancel</v-icon>
                                </div>
                                <div class="mr-2" v-if="deleteItemSelected == action">
                                    <v-btn color="removal" @click="deleteAction(action)" rounded size="x-small">Delete</v-btn>
                                </div>
                                <div>
                                    <span>{{ actionSummary(action) }}</span>
                                </div>
                            </v-container>
                        </div>
                        <div class="mb-3" v-if="recipe.killSwitch">
                            <v-container class="ma-0 pa-0 d-flex align-start" fluid>
                                <div class="mr-2">
                                    <v-icon color="accent">mdi-stop-circle-outline</v-icon>
                                </div>
                                <span>Stop executing further automations</span>
                            </v-container>
                        </div>
                        <div>
                            <v-btn class="ml-n3 mt-2" color="primary" title="Add a new action" @click.stop="showActionDialog" rounded variant="text" size="small">
                                <v-icon class="mr-2">mdi-plus-circle</v-icon>
                                Add new action
                            </v-btn>
                        </div>
                        <v-dialog v-model="actionDialog" width="640" opacity="0.95" :fullscreen="smAndDown" persistent>
                            <recipes-add-action :disabled-actions="disabledActions" @closed="setAction" />
                        </v-dialog>
                    </v-card-text>
                </v-card>
            </template>

            <v-card v-if="!recipe.defaultFor && recipe.conditions.length > 1" class="mt-4" variant="outlined">
                <v-card-title>Logical operators</v-card-title>
                <v-card-text>
                    <div v-if="recipe.conditions.length > 2">
                        <div>Within conditions of the same type.</div>
                        <v-radio-group v-model="recipe.samePropertyOp" class="mt-0 mb-0" inline>
                            <v-radio label="AND" value="AND"></v-radio>
                            <v-radio label="OR" value="OR"></v-radio>
                        </v-radio-group>
                        <div>Between conditions of different types.</div>
                        <v-radio-group v-model="recipe.op" class="mt-0 mb-n4" inline>
                            <v-radio label="AND" value="AND"></v-radio>
                            <v-radio label="OR" value="OR"></v-radio>
                        </v-radio-group>
                    </div>
                    <div v-else>
                        <div>Between any conditions.</div>
                        <v-radio-group v-model="recipe.op" class="mt-0 mb-n4" inline>
                            <v-radio label="AND" value="AND"></v-radio>
                            <v-radio label="OR" value="OR"></v-radio>
                        </v-radio-group>
                    </div>
                </v-card-text>
            </v-card>

            <v-card v-if="recipe.id && hasCounter" class="mt-4" variant="outlined">
                <v-card-title>Counter</v-card-title>
                <v-card-text class="mb-0 pb-0">
                    <div>You can customize which data should be used to increment the ${counter} tag.</div>
                    <v-row class="mt-6" no-gutters>
                        <v-col :cols="mdAndUp ? 4 : 12" class="mr-md-4">
                            <v-select v-model="counterProp" label="Activity metadata" class="flex-shrink" :items="counterProps" item-title="text" density="compact" variant="outlined" rounded></v-select>
                        </v-col>
                        <v-col v-if="counterProp == 'segments'" :cols="mdAndUp ? 4 : 12" class="mr-md-4">
                            <v-combobox
                                v-model="counterSegmentIds"
                                label="Segment IDs"
                                hint="Type an ID and press Enter to add it"
                                :error-messages="counterSegmentErrors"
                                multiple
                                chips
                                closable-chips
                                hide-selected
                                persistent-hint
                                density="compact"
                                variant="outlined"
                                rounded
                            ></v-combobox>
                        </v-col>
                        <v-col :cols="mdAndUp ? 2 : 12">
                            <v-text-field v-model="recipeStats.counter" type="number" label="Current value" min="0" max="999999" density="compact" variant="outlined" rounded></v-text-field>
                        </v-col>
                    </v-row>
                    <template v-if="user.preferences.dateResetCounter">
                        <div class="mt-1">By default counters will auto reset every year on {{ $dayjs(user.preferences.dateResetCounter).format("MMM DD") }}, if you prefer you can disable it.</div>
                        <div class="mt-1 text-caption">This setting affects only this counter!</div>
                        <div class="mt-1 ml-n1">
                            <v-checkbox v-model="recipe.counterNoReset" label="Please do not it reset yearly" title="Disable the counter auto reset" density="compact" color="primary" />
                        </div>
                    </template>
                </v-card-text>
            </v-card>
            <div class="mt-6">
                <v-switch class="ma-0 pa-0" title="Automation kill switch" v-model="recipe.killSwitch" label="Stop executing further automations" color="primary"></v-switch>
            </div>
            <div class="mt-n1">
                <v-switch class="ma-0 pa-0" title="Automation status" v-model="recipe.disabled" label="Disable this automation" color="primary"></v-switch>
            </div>
            <v-alert v-if="sharedRecipe">
                This automation is based on a template shared by <a target="strava" :href="'https://www.strava.com/athletes/' + sharedRecipe.userId">{{ sharedRecipe.userDisplayName }}</a>
            </v-alert>
            <div class="text-center text-md-left mt-2">
                <v-btn color="primary" title="Save this automation" :disabled="!valid" @click="save" rounded>
                    <v-icon start>mdi-content-save</v-icon>
                    Save automation
                </v-btn>
                <br v-if="!mdAndUp" />
                <v-btn color="primary" title="Duplicate this automation" class="mt-4 mt-md-0 ml-md-2" v-if="recipe.id" :disabled="!valid" @click="duplicate" rounded variant="outlined">
                    <v-icon start>mdi-content-duplicate</v-icon>
                    Duplicate
                </v-btn>
                <br v-if="!mdAndUp" />
                <v-btn color="primary" title="Share this automation" class="mt-4 mt-md-0 ml-md-2" v-if="recipe.id && user.isPro" :disabled="!valid" @click="shareRecipe(recipe)" rounded variant="outlined">
                    <v-icon start>mdi-share-variant</v-icon>
                    Share
                </v-btn>
                <br v-if="!mdAndUp" />
                <v-btn color="removal" title="Delete this automation" class="mt-4 mt-md-0 ml-md-2" v-if="recipe.id" @click.stop="showDeleteDialog" rounded variant="outlined">
                    <v-icon start>mdi-delete</v-icon>
                    Delete automation
                </v-btn>
            </div>
            <v-dialog v-model="deleteDialog" width="440" opacity="0.95">
                <v-card>
                    <v-toolbar color="removal">
                        <v-toolbar-title>Delete automation</v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-toolbar-items>
                            <v-btn icon="mdi-close" @click.stop="hideDeleteDialog"></v-btn>
                        </v-toolbar-items>
                    </v-toolbar>
                    <v-card-text>
                        <h3 class="mt-4">{{ recipe.title }}</h3>
                        <p class="mt-2">Are you sure you want to delete this automation?</p>
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
import JsonEditorVue from "json-editor-vue"

useHead({title: useRoute().query.id ? "Edit automation" : "New automation"})

const store = useMainStore()
const route = useRoute()
const api = useApi()
const webError = useWebError()
const {mdAndUp, smAndDown} = useDisplay()
const {user} = useUser()
const {recipeRules, actionSummary, conditionSummary, codeLogicalOperator, shareRecipe} = useRecipe()
const {getSportName} = useStrava()
const recipeMaxLength = computed(() => store.recipeMaxLength || {})

const form = ref<any>(null)
const recipe = ref<any>(null)
const recipeStats = ref<any>({counter: 0})
const recipePropertiesActions = ref<any[]>([])
const counterProp = ref<string | null>(null)
const counterProps = [
    {text: "Execution count", value: null},
    {text: "Distance", value: "distance"},
    {text: "Elevation gain", value: "elevationGain"},
    {text: "Lap count", value: "lapCount"},
    {text: "Specific segment count", value: "segments"},
    {text: "Any segment PR count", value: "segments.pr"},
    {text: "Any segment KOM count", value: "segments.kom"}
]
const counterSegmentIds = ref<string[]>([])
const counterSegmentValidationAttempted = ref(false)
const currentCounter = ref<any>(0)
const valid = ref(false)
const disabledActions = ref<string[]>([])
const actionDialog = ref(false)
const conditionDialog = ref(false)
const deleteItemSelected = ref<any | false>(false)
const deleteDialog = ref(false)
const hasChanges = ref(false)
const asJson = ref(false)
const jsonSpecsDialog = ref(false)
const jsonSpecsItem = ref<any>(null)
const jsonData = ref<any>(null)
const jsonErrors = ref<any[]>([])
const isNew = ref(false)
const templateId = ref<any>(false)
const sharedRecipe = ref<any>(null)

const overMaxRecipes = computed(() => (!user.value ? false : !user.value.isPro && Object.keys(user.value.recipes).length > store.freePlanDetails.maxRecipes))
const hasCounter = computed(() => (recipe.value ? _.find(recipe.value.actions, (action: any) => _.isString(action.value) && action.value.includes("${counter}")) : false))
const changedCounter = computed(() => recipeStats.value.counter != currentCounter.value)
const counterSegmentErrors = computed(() => (counterSegmentValidationAttempted.value && counterProp.value == "segments" && !getCounterProp() ? ["Add at least one segment ID"] : []))
const groupedConditions = computed(() => {
    if (!recipe.value || !recipe.value.conditions || recipe.value.conditions.length == 0) return null
    return _.groupBy(recipe.value.conditions, "property")
})

/**
 * Toggle between form mode and JSON mode.
 */
const toggleMode = () => {
    updateJson()
    asJson.value = !asJson.value
}

/**
 * Synchronize form data and JSON editor data.
 */
const updateJson = () => {
    try {
        if (asJson.value) {
            const parsedJson = _.isString(jsonData.value) ? JSON.parse(jsonData.value) : jsonData.value
            const currentDefaultFor = recipe.value.defaultFor ? JSON.stringify(recipe.value.defaultFor, null, 0).replace(/ /, "") : null
            const currentConditions = recipe.value.conditions ? JSON.stringify(recipe.value.conditions, null, 0).replace(/ /, "") : null
            const currentActions = JSON.stringify(recipe.value.actions, null, 0).replace(/ /, "")
            const currentData = `{"${currentDefaultFor ? "defaultFor" : "conditions"}":${currentDefaultFor || currentConditions},"actions":${currentActions}}`
            hasChanges.value = currentData != JSON.stringify(parsedJson, null, 0).replace(/ /, "")

            if (jsonErrors.value.length == 0) {
                recipe.value.actions = parsedJson.actions
                if (parsedJson.defaultFor) {
                    recipe.value.defaultFor = parsedJson.defaultFor
                } else {
                    recipe.value.conditions = parsedJson.conditions
                }
                if (parsedJson.op) {
                    recipe.value.op = parsedJson.op
                }
                if (parsedJson.samePropertyOp) {
                    recipe.value.samePropertyOp = parsedJson.samePropertyOp
                }
                setCounterProp(parsedJson.counterProp)
                if (parsedJson.counterNoReset) {
                    recipe.value.counterNoReset = parsedJson.counterNoReset
                }
            }
        } else {
            const nextJson: any = {}
            nextJson.actions = _.cloneDeep(recipe.value.actions)

            if (recipe.value.defaultFor) {
                nextJson.defaultFor = _.cloneDeep(recipe.value.defaultFor)
            } else {
                nextJson.conditions = _.cloneDeep(recipe.value.conditions)
            }
            if (recipe.value.op) {
                nextJson.op = recipe.value.op
            }
            if (recipe.value.samePropertyOp) {
                nextJson.samePropertyOp = recipe.value.samePropertyOp
            }
            const currentCounterProp = getCounterProp()
            if (currentCounterProp) {
                nextJson.counterProp = currentCounterProp
            }
            if (recipe.value.counterNoReset) {
                nextJson.counterNoReset = recipe.value.counterNoReset
            }

            jsonData.value = nextJson
            jsonErrors.value = []
        }
    } catch (ex: any) {
        jsonErrors.value.push({message: ex.toString()})
    }
}

/**
 * Validate automation JSON in the editor.
 */
const validateJson = (data: any) => {
    const vErrors: any[] = []

    try {
        const parsedJson = data

        if (!parsedJson.defaultFor && (!parsedJson.conditions || parsedJson.conditions.length == 0)) {
            vErrors.push({message: `A "defaultFor" or "conditions" list is mandatory`, path: []})
        } else if (parsedJson.defaultFor && parsedJson.conditions?.length > 0) {
            vErrors.push({message: `Automation cannot have "defaultFor" and "conditions", please use just one`, path: []})
        }

        if (parsedJson.conditions?.length > 0) {
            for (let i = 0; i < parsedJson.conditions.length; i++) {
                const condition = parsedJson.conditions[i]
                const path = ["conditions", i]
                if (!condition.property) {
                    vErrors.push({message: `Condition ${i} is missing the "property"`, path})
                } else if (!_.find(store.recipeProperties, {value: condition.property})) {
                    vErrors.push({message: `Condition ${i} has an invalid "property"`, path})
                }
                if (!condition.operator) {
                    vErrors.push({message: `Condition ${i} is missing an "operator"`, path})
                }
            }
        }

        if (!parsedJson.actions) {
            vErrors.push({message: `Missing the "actions" list`, path: []})
        } else if (parsedJson.actions.length == 0) {
            vErrors.push({message: `You must define at least 1 action`, path: ["actions"]})
        } else {
            for (let i = 0; i < parsedJson.actions.length; i++) {
                const action = parsedJson.actions[i]
                if (!action.type) {
                    vErrors.push({message: `Action ${i} is missing the "property" type`, path: ["actions", i]})
                }
            }
        }

        if (parsedJson.op && !["AND", "OR"].includes(parsedJson.op)) {
            vErrors.push({message: `Logical operator "op" must be either "AND" or "OR"`, path: ["op"]})
        }
        if (parsedJson.samePropertyOp && !["AND", "OR"].includes(parsedJson.samePropertyOp)) {
            vErrors.push({message: `Logical operator "samePropertyOp" must be either "AND" or "OR"`, path: ["samePropertyOp"]})
        }

        if (counterProp.value == "segments" && !getCounterProp()) {
            vErrors.push({message: "Counter needs at least one segment ID", path: ["counterProp"]})
        }
    } catch (ex: any) {
        vErrors.push({message: ex.toString()})
    }

    jsonErrors.value = vErrors
    valid.value = vErrors.length == 0

    return vErrors
}

/**
 * Check whether the title form is valid.
 */
const validateForm = async (): Promise<boolean> => {
    const result = await form.value?.validate()
    return typeof result == "boolean" ? result : !!result?.valid
}

/**
 * Save the automation recipe.
 */
const save = async () => {
    try {
        if (asJson.value) {
            updateJson()
            recipe.value.asJson = true
        } else {
            delete recipe.value.asJson
        }

        if (await validateForm()) {
            const currentCounterProp = getCounterProp()
            if (!asJson.value && counterProp.value == "segments" && !currentCounterProp) {
                counterSegmentValidationAttempted.value = true
                return
            }

            hasChanges.value = false
            if (changedCounter.value) {
                await setCounter()
            }

            recipe.value.counterProp = currentCounterProp

            if (recipe.value.defaultFor == null) delete recipe.value.defaultFor
            if (!recipe.value.disabled) delete recipe.value.disabled
            if (!recipe.value.counterProp) delete recipe.value.counterProp
            if (!recipe.value.counterNoReset) delete recipe.value.counterNoReset

            const url = `/api/users/${user.value.id}/recipes`
            const recipeData: any = await api(url, {method: "POST", body: recipe.value})
            const queryField = isNew.value ? "new" : "updated"

            store.setUserRecipe(recipeData)
            await navigateTo(`/automations?${queryField}=${recipeData.id}`)
        }
    } catch (ex: any) {
        const data = ex?.data || ex?.response?._data || ex?.response?.data
        if ((ex?.response?.status == 400 || ex?.status == 400 || data?.status == 400) && data?.message) {
            jsonErrors.value = [{message: data.message}]
        } else {
            webError("AutomationEdit.save", ex)
        }
    }
}

/**
 * Navigate to a duplicate automation form.
 */
const duplicate = async () => {
    try {
        document.location.href = `/automations/edit?template=${recipe.value.id}`
    } catch (ex) {
        webError("AutomationEdit.duplicate", ex)
    }
}

/**
 * Persist the current counter value.
 */
const setCounter = async () => {
    try {
        currentCounter.value = recipeStats.value.counter

        const url = `/api/users/${user.value.id}/recipes/stats/${recipe.value.id}`
        const body = {id: recipe.value.id, counter: parseFloat(currentCounter.value)}
        await api(url, {method: "POST", body})
    } catch (ex) {
        webError("AutomationEdit.setCounter", ex)
    }
}

/** Return the persisted counter setting from the form state. */
const getCounterProp = () => {
    if (counterProp.value != "segments") return counterProp.value

    const segmentIds = [...new Set(counterSegmentIds.value.map((value) => value.toString().trim()).filter(Boolean))]
    return segmentIds.length > 0 ? `segments.${segmentIds.join(",")}` : null
}

/** Populate counter form state from a saved counter setting. */
const setCounterProp = (savedCounterProp: string | null) => {
    counterProp.value = savedCounterProp || null
    counterSegmentIds.value = []

    if (savedCounterProp?.startsWith("segments.") && !["segments.pr", "segments.kom"].includes(savedCounterProp)) {
        counterProp.value = "segments"
        counterSegmentIds.value = [
            ...new Set(
                savedCounterProp
                    .substring("segments.".length)
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
            )
        ]
    }
}

/**
 * Update whether the current recipe can be saved.
 */
const checkValid = () => {
    const hasConditions = recipe.value.defaultFor || recipe.value.conditions.length > 0
    valid.value = hasConditions && recipe.value.actions.length > 0 && jsonErrors.value.length == 0
}

/**
 * Check whether this recipe would benefit from delayed processing.
 */
const needsDelay = (currentRecipe: any) => {
    const conditions = currentRecipe.conditions.map((condition: any) => condition.property)
    return !user.value.preferences.delayedProcessing && _.intersection(["gear", "description"], conditions).length > 0
}

const showJsonSpecsDialog = () => (jsonSpecsDialog.value = true)
const hideJsonSpecsDialog = () => (jsonSpecsDialog.value = false)

/**
 * Open the add action dialog with conflicting actions disabled.
 */
const showActionDialog = () => {
    disabledActions.value = _.map(recipe.value.actions, "type").filter((type: string) => !type.includes("GearComponent"))
    conditionDialog.value = false
    actionDialog.value = true
}

const showConditionDialog = () => {
    actionDialog.value = false
    conditionDialog.value = true
}

/**
 * Add an action returned by the dialog.
 */
const setAction = (value: any | false) => {
    if (value) {
        recipe.value.actions.push(value)
        hasChanges.value = true
    }

    recipe.value.actions = _.sortBy(recipe.value.actions, (action: any) => _.find(store.recipeActions, {value: action.type})?.text)

    checkValid()
    actionDialog.value = false
}

/**
 * Add a condition returned by the dialog.
 */
const setCondition = (value: any | false) => {
    if (value) {
        if (value.defaultFor) {
            recipe.value.defaultFor = value.defaultFor
        } else {
            recipe.value.conditions.push(value)
        }

        hasChanges.value = true
    }

    checkValid()
    conditionDialog.value = false
}

const deleteAction = (action: any) => {
    recipe.value.actions.splice(recipe.value.actions.indexOf(action), 1)
    checkValid()
    deleteItemSelected.value = false
    hasChanges.value = true
}

const deleteCondition = (condition: any) => {
    if (condition.defaultFor) {
        recipe.value.defaultFor = null
    } else {
        recipe.value.conditions.splice(recipe.value.conditions.indexOf(condition), 1)
    }

    checkValid()
    deleteItemSelected.value = false
    hasChanges.value = true
}

const confirmDelete = (obj: any) => (deleteItemSelected.value = obj)
const cancelDelete = () => (deleteItemSelected.value = false)
const showDeleteDialog = () => (deleteDialog.value = true)
const hideDeleteDialog = () => (deleteDialog.value = false)

/**
 * Delete this automation recipe.
 */
const deleteRecipe = async () => {
    const recipeId = recipe.value.id
    const recipeTitle = recipe.value.title

    hasChanges.value = false

    try {
        await api(`/api/users/${user.value.id}/recipes/${recipe.value.id}`, {method: "DELETE"})
    } catch (ex) {
        webError("AutomationEdit.deleteRecipe", ex)
    }

    deleteDialog.value = false

    store.deleteUserRecipe(recipe.value)
    await navigateTo(`/automations?deleted=${recipeId}&title=${recipeTitle}`)
}

/**
 * Load shared template or recipe stats before initializing the page.
 */
const loadPreData = async () => {
    const template = route.query?.template?.toString()
    const id = route.query?.id?.toString()

    if (template?.substring(0, 1) == "s") {
        try {
            sharedRecipe.value = await api(`/api/shared-recipes/${user.value.id}/${template}`)
        } catch (ex) {
            webError("AutomationEdit.fetch", {status: 500, title: "Could not fetch the shared recipe template", message: ex?.toString?.() || ex})
        }
        return
    }

    if (!id || !store.user.recipes[id]) return

    try {
        const stats: any = await api(`/api/users/${user.value.id}/recipes/stats/${id}`)

        if (stats) {
            recipeStats.value = stats
            currentCounter.value = stats.counter || 0
        } else {
            currentCounter.value = 0
        }
    } catch (ex) {
        webError("AutomationEdit.fetch", ex)
    }
}

/**
 * Initialize the recipe and help-list state.
 */
const initializeRecipe = () => {
    let nextValid = false
    let nextIsNew = true
    let nextTemplateId: any = false
    let nextRecipe: any = {conditions: [], actions: []}

    if (sharedRecipe.value) {
        nextRecipe = _.cloneDeep(_.pick(sharedRecipe.value, ["conditions", "defaultFor", "actions", "op", "samePropertyOp", "title"]))
        nextRecipe.sharedRecipeId = sharedRecipe.value.id
    } else if (route.query?.id) {
        nextRecipe = _.cloneDeep(store.user.recipes[route.query.id.toString()])
        nextValid = true
        nextIsNew = false
    } else if (route.query?.template) {
        nextTemplateId = route.query.template
        if (nextTemplateId?.toString().substring(0, 1) != "s") {
            nextRecipe = _.cloneDeep(store.user.recipes[route.query.template.toString()])
            nextRecipe.title += " (copy)"
            delete nextRecipe.id
        }
    }

    if (!nextRecipe) {
        webError("AutomationEdit.data", {status: 404, title: "Automation not found", message: `We could not find an automation recipe with ID ${route.query.id}`})
        return
    }

    if (!nextRecipe.op) nextRecipe.op = "AND"
    if (!nextRecipe.samePropertyOp) nextRecipe.samePropertyOp = nextRecipe.op
    if (!nextRecipe.counterProp) nextRecipe.counterProp = null
    else if (currentCounter.value) currentCounter.value = currentCounter.value.toFixed(1)

    const properties = _.cloneDeep(store.recipeProperties)
    properties.forEach((property: any) => (property.value = `Property: ${property.value}`))
    const actions = _.cloneDeep(store.recipeActions)
    actions.forEach((action: any) => (action.value = `Action: ${action.value}`))
    recipePropertiesActions.value = _.concat([{value: "defaultFor", text: "Default automation for specific sport types"}], properties, actions)

    recipe.value = nextRecipe
    valid.value = nextValid
    isNew.value = nextIsNew
    templateId.value = nextTemplateId

    if (recipe.value.counterProp) {
        setCounterProp(recipe.value.counterProp)
    }
}

onMounted(async () => {
    await loadPreData()
    initializeRecipe()
})

onBeforeRouteLeave((to, from, next) => {
    if (hasChanges.value || changedCounter.value) {
        const answer = window.confirm("You have unsaved changes on this automation. Sure you want to leave?")

        if (answer) {
            next()
        } else {
            next(false)
        }
    } else {
        next()
    }
})
</script>
