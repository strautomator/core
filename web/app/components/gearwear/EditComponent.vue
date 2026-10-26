<template>
    <v-card>
        <v-toolbar color="primary">
            <v-toolbar-title>
                <v-icon class="mr-2" v-if="component?.name">{{ getComponentIcon(component) }}</v-icon>
                {{ component?.name ? "Edit" : "New" }} component
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
                <v-btn icon="mdi-close" @click.stop="cancel"></v-btn>
            </v-toolbar-items>
        </v-toolbar>
        <v-card-text>
            <v-form v-model="valid" ref="componentForm">
                <div class="d-flex flex-grow-1 mt-5">
                    <v-text-field v-model="name" label="Component name" placeholder="Ex: chain, cassette, tires..." maxlength="20" :rules="nameRules" validate-on="blur" variant="outlined" rounded></v-text-field>
                </div>
                <div class="d-flex">
                    <div class="flex-grow-1">
                        <v-text-field v-model="currentDistance" type="number" class="mr-1" label="Current distance" min="0" :suffix="distanceUnits" variant="outlined" rounded></v-text-field>
                    </div>
                    <div class="flex-grow-0 text-center">
                        <v-icon class="mt-4 ml-1 mr-1" :color="Number(alertDistance) > 0 ? 'primary' : ''">mdi-sign-direction</v-icon>
                    </div>
                    <div class="flex-grow-1">
                        <v-text-field v-model="alertDistance" type="number" class="ml-1" label="Alert on" hint="0 to disable" min="100" :rules="distanceAlertRules" :suffix="distanceUnits" variant="outlined" rounded></v-text-field>
                    </div>
                </div>
                <div class="d-flex mt-1">
                    <div class="flex-grow-1">
                        <v-text-field v-model="currentHours" type="number" class="mr-1" label="Current hours" min="0" suffix="h" variant="outlined" rounded></v-text-field>
                    </div>
                    <div class="flex-grow-0 text-center">
                        <v-icon class="mt-4 ml-1 mr-1" :color="Number(alertHours) > 0 ? 'primary' : ''">mdi-clock-outline</v-icon>
                    </div>
                    <div class="flex-grow-1">
                        <v-text-field v-model="alertHours" type="number" class="ml-1" label="Alert on" hint="0 to disable" min="20" :rules="hoursAlertRules" suffix="h" variant="outlined" rounded></v-text-field>
                    </div>
                </div>
                <div class="mb-3 ml-md-2 text-center text-md-left">
                    <div class="mb-1">Send a first reminder when usage reaches:</div>
                    <div class="d-flex justify-center justify-md-start">
                        <v-radio-group v-model="preAlertPercent" class="mt-0 mb-0" inline>
                            <v-radio label="Don't" :value="0"></v-radio>
                            <v-radio label="50%" :value="50"></v-radio>
                            <v-radio label="80%" :value="80"></v-radio>
                        </v-radio-group>
                    </div>
                </div>
                <div class="text-center">
                    <v-btn color="removal" v-if="!isNew" @click="deletePrompt" title="Delete this component" rounded variant="outlined">
                        <v-icon start>mdi-close-circle</v-icon>
                        Delete
                    </v-btn>
                    <br v-if="!mdAndUp" />
                    <v-btn color="primary" class="mt-4 mt-md-0 ml-md-2" :disabled="!hasAlert" @click="save" title="Save component details" rounded>
                        <v-icon start>mdi-check</v-icon>
                        Save component
                    </v-btn>
                </div>
            </v-form>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import _ from "lodash"

const props = defineProps<{
    gearwearConfig: any
    component: any
}>()

const emit = defineEmits<{
    closed: [component: any, changes?: string[]]
}>()

const {mdAndUp} = useDisplay()
const {distanceUnits} = useUser()
const {getComponentIcon} = useGearwear()

const componentForm = useTemplateRef<any>("componentForm")
const isNew = ref(true)
const valid = ref(false)
const name = ref("")
const currentDistance = ref<any>(0)
const currentHours = ref<any>(0)
const alertDistance = ref<any>(0)
const alertHours = ref<any>(0)
const preAlertPercent = ref<any>(0)

const nameRules = computed(() => {
    const rules = {
        required: (value: any) => !!value || "Field is required",
        name: (value: any) => {
            if (props.gearwearConfig.components.length == 0) return true
            if (value && !_.find(props.gearwearConfig.components, {name: value.trim()})) return true
            if (props.component && props.component.name == value) return true
            return `${value} is a duplicate of another component`
        }
    }

    return [rules.required, rules.name]
})

const distanceAlertRules = computed(() => {
    const rules = {
        number: (value: any) => {
            if (value >= 100 || value == "0" || value == "") return true
            return "Minimum is 0"
        }
    }

    return [rules.number]
})

const hoursAlertRules = computed(() => {
    const rules = {
        number: (value: any) => {
            if (value >= 20 || value == "0" || value == "") return true
            return "Minimum is 0"
        }
    }

    return [rules.number]
})

const hasAlert = computed(() => Number(alertHours.value) > 0 || Number(alertDistance.value) > 0)

watch(
    () => props.component,
    (newVal) => {
        if (newVal?.name) {
            fill(newVal)
            isNew.value = false
        } else {
            isNew.value = true
            name.value = ""
            currentDistance.value = 0
            alertDistance.value = 1000
            currentHours.value = 0
            alertHours.value = 0
        }
    }
)

onMounted(() => {
    if (props.component?.name) {
        fill(props.component)
        isNew.value = false
    } else {
        isNew.value = true
    }
})

/**
 * Populate the form with the selected component.
 */
const fill = (newVal: any) => {
    name.value = newVal.name
    currentDistance.value = newVal.currentDistance
    alertDistance.value = newVal.alertDistance
    currentHours.value = newVal.currentTime ? Math.round(newVal.currentTime / 3600) : 0
    alertHours.value = newVal.alertTime ? Math.round(newVal.alertTime / 3600) : 0
    preAlertPercent.value = newVal.preAlertPercent || 0
}

const cancel = () => emit("closed", false)

/**
 * Validate and return the component data to the parent.
 */
const save = async () => {
    const validation = await componentForm.value?.validate()
    if (validation?.valid === false) return

    const compName = name.value
    const compCurrentDistance = parseInt(currentDistance.value)
    const compAlertDistance = parseInt(alertDistance.value)
    const compCurrentHours = parseInt(currentHours.value)
    const compAlertHours = parseInt(alertHours.value)
    const compPreAlertPercent = parseInt(preAlertPercent.value)

    const component = {
        name: compName,
        currentDistance: compCurrentDistance,
        alertDistance: compAlertDistance,
        currentTime: compCurrentHours > 0 ? compCurrentHours * 3600 : 0,
        alertTime: compAlertHours > 0 ? compAlertHours * 3600 : 0,
        preAlertPercent: compPreAlertPercent,
        dateLastUpdate: new Date()
    }

    const changes: string[] = []

    if (props.component.name) {
        if (props.component.currentDistance != compCurrentDistance) {
            changes.push("current distance")
        }
        if (Math.round(props.component.currentTime / 3600) != compCurrentHours) {
            changes.push("distance alert")
        }
        if (Math.round(props.component.alertTime / 3600) != compAlertHours) {
            changes.push("time alert")
        }
    }

    emit("closed", component, changes)
}

const deletePrompt = () => emit("closed", "delete")
</script>
