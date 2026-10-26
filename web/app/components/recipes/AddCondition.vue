<template>
    <v-card>
        <v-toolbar color="primary">
            <v-toolbar-title>Condition</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
                <v-btn icon="mdi-close" @click="cancel"></v-btn>
            </v-toolbar-items>
        </v-toolbar>
        <v-card-title class="text-h5">If the activity...</v-card-title>
        <v-card-text>
            <v-form v-model="valid" ref="form">
                <v-container class="ma-0 pa-0" fluid>
                    <v-row no-gutters>
                        <v-col cols="12" :sm="12" :md="isLocationImg ? 7 : 12">
                            <v-autocomplete
                                v-model="selectedProperty"
                                label="Select a condition"
                                :items="recipeProperties"
                                item-title="text"
                                @update:model-value="propertyChanged"
                                density="compact"
                                variant="outlined"
                                rounded
                                return-object
                            ></v-autocomplete>
                            <div v-if="selectedProperty?.value">
                                <v-select
                                    v-if="!isDefaultFor && !isBoolean"
                                    v-model="selectedOperator"
                                    label="Operator"
                                    :hint="selectedOperator?.description"
                                    :items="selectedProperty?.operators"
                                    :item-title="operatorTitle"
                                    density="compact"
                                    variant="outlined"
                                    rounded
                                    return-object
                                ></v-select>
                                <div v-if="isDefaultFor">
                                    <v-select label="Sport types" v-model="selectedDefaultFor" :items="defaultSportTypes" item-title="text" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="isSportType">
                                    <v-select label="Sport types" v-model="selectedSportTypes" :items="sportTypes" item-title="text" :rules="sportInputRules" multiple density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="isGear">
                                    <v-select label="Gear" v-model="selectedGear" :items="allGear" item-title="text" :rules="gearInputRules" multiple density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="isBoolean && hasOperators">
                                    <v-select label="Yes or No?" v-model="selectedBoolean" :items="booleans" item-title="text" :rules="booleanInputRules" density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="isWeekday">
                                    <v-select label="Weekday" v-model="selectedWeekdays" :items="weekdays" item-title="text" :rules="weekdayInputRules" multiple density="compact" variant="outlined" rounded return-object></v-select>
                                </div>
                                <div v-else-if="isLocation">
                                    <v-autocomplete
                                        v-model="locationInput"
                                        v-model:search="searchLocations"
                                        label="Location or geo coordinates"
                                        item-title="address"
                                        :items="locations"
                                        :loading="loading"
                                        :rules="locationInputRules"
                                        return-object
                                        density="compact"
                                        rounded
                                        variant="outlined"
                                        no-filter
                                    ></v-autocomplete>
                                </div>
                                <div v-else-if="isDateRange">
                                    <v-row>
                                        <v-col cols="12" :sm="12" :md="6">
                                            <v-text-field v-model="valueDateFrom" type="text" prefix="From: " :rules="valueInputRules" :placeholder="inputPlaceholder" @keyup="valueKeyUp" density="compact" variant="outlined" rounded></v-text-field>
                                        </v-col>
                                        <v-col cols="12" :sm="12" :md="6">
                                            <v-text-field v-model="valueDateTo" type="text" prefix="To: " :rules="valueInputRules" :placeholder="inputPlaceholder" @keyup="valueKeyUp" density="compact" variant="outlined" rounded></v-text-field>
                                        </v-col>
                                    </v-row>
                                </div>
                                <div v-else-if="hasOperators && !isAny">
                                    <v-text-field v-model="valueInput" type="text" :rules="valueInputRules" :suffix="selectedSuffix" :placeholder="inputPlaceholder" @keyup="valueKeyUp" density="compact" variant="outlined" rounded></v-text-field>
                                </div>
                            </div>
                            <div class="text-center mb-6" v-if="isDefaultFor">
                                <v-icon color="grey" size="small">mdi-information-outline</v-icon>
                                <span>This automation will run on <strong>all</strong> future "{{ selectedDefaultFor?.value }}" activities!</span>
                            </div>
                        </v-col>
                        <v-col cols="12" :sm="12" :md="5" v-if="isLocationImg">
                            <v-img class="mb-1 mb-md-0 ml-md-5" :src="locationImageSrc"></v-img>
                        </v-col>
                    </v-row>
                    <v-row no-gutters>
                        <v-col class="mt-4 text-center" cols="12">
                            <v-btn color="primary" @click="save" title="Save this condition" :disabled="!isBoolean && (!selectedProperty?.value || !selectedOperator?.value)" rounded>
                                <v-icon start>mdi-check</v-icon>
                                Save condition
                            </v-btn>
                        </v-col>
                    </v-row>
                </v-container>
            </v-form>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import _ from "lodash"
import dayjs from "dayjs"

type SelectItem = Record<string, any>

const emit = defineEmits<{closed: [value: any | false]}>()

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {user} = useUser()
const {getSportName} = useStrava()
const {recipeRules} = useRecipe()

const form = ref<any>(null)
const condition = ref<SelectItem>({})
const loading = ref(false)
const valid = ref(true)
const recipeProperties = ref<SelectItem[]>([])
const defaultSportTypes = ref<SelectItem[]>([])
const sportTypes = ref<SelectItem[]>([])
const allGear = ref<SelectItem[]>([])
const booleans = ref<SelectItem[]>([])
const weekdays = ref<SelectItem[]>([])
const selectedSportTypes = ref<SelectItem[]>([])
const selectedGear = ref<SelectItem[]>([])
const selectedWeekdays = ref<SelectItem[]>([])
const selectedBoolean = ref<SelectItem | null>(null)
const selectedProperty = ref<SelectItem | null>(null)
const selectedOperator = ref<SelectItem | null>(null)
const selectedDefaultFor = ref<SelectItem | null>(null)
const valueInput = ref("")
const valueDateFrom = ref("")
const valueDateTo = ref("")
const locationInput = ref<SelectItem | null>(null)
const searchLocations = ref("")
const locations = ref<SelectItem[]>([])
let searchTimerId: number | null = null

const selectedSuffix = computed(() => {
    if (!selectedProperty.value || selectedProperty.value?.type == "time") return ""
    if (user.value.preferences.weatherUnit == "f" && selectedProperty.value?.fSuffix) return selectedProperty.value?.fSuffix
    if (user.value.profile.units == "imperial" && selectedProperty.value?.impSuffix) return selectedProperty.value?.impSuffix
    return selectedProperty.value?.suffix
})
const inputPlaceholder = computed(() => {
    if (selectedProperty.value?.type == "time") return "00:00"
    if (selectedProperty.value?.type == "date") return "YYYY-MM-DD or MM-DD"
    return ""
})
const hasOperators = computed(() => selectedProperty.value?.operators?.length > 0)
const isDefaultFor = computed(() => selectedProperty.value?.value == "defaultFor")
const isSportType = computed(() => selectedProperty.value?.value == "sportType")
const isGear = computed(() => selectedProperty.value?.value == "gear")
const isWeekday = computed(() => selectedProperty.value?.value == "weekday")
const isDateRange = computed(() => selectedProperty.value?.value == "dateRange")
const isPace = computed(() => selectedProperty.value?.value?.substring(0, 4) == "pace")
const isBoolean = computed(() => selectedProperty.value?.type == "boolean")
const isAny = computed(() => selectedOperator.value?.value == "any")
const isLocation = computed(() => selectedProperty.value?.value == "polyline" || selectedProperty.value?.value?.includes("location"))
const isLocationImg = computed(() => isLocation.value && selectedOperator.value?.value && locationInput.value?.value)
const locationRadius = computed(() => (selectedOperator.value?.value == "=" ? 10 : 40))
const locationImageSrc = computed(() => {
    const circle = selectedOperator.value?.value == "=" ? 40 : 500
    const zoom = selectedOperator.value?.value == "=" ? 17 : 14
    return `/api/maps/${user.value.id}/image?latlong=${locationInput.value.value}&circle=${circle}&zoom=${zoom}`
})
const sportInputRules = computed(() => (isSportType.value ? [recipeRules.required, () => selectedSportTypes.value.length > 0] : []))
const gearInputRules = computed(() => (isGear.value ? [recipeRules.required, () => selectedGear.value.length > 0] : []))
const booleanInputRules = computed(() => (isBoolean.value ? [recipeRules.required, () => selectedBoolean.value?.value === false || selectedBoolean.value?.value === true] : []))
const weekdayInputRules = computed(() => (isWeekday.value ? [recipeRules.required, () => selectedWeekdays.value.length > 0] : []))
const locationInputRules = computed(() => (isLocation.value ? [recipeRules.required, () => (locationInput.value && locationInput.value.value.length > 0 ? true : false)] : []))
const valueInputRules = computed(() => {
    if (!selectedProperty.value) return [recipeRules.required]
    if (isDefaultFor.value) return []
    if (selectedProperty.value?.type == "date") return [recipeRules.required, recipeRules.date]
    if (["dateStart", "dateEnd"].includes(selectedProperty.value?.value)) return [recipeRules.required, recipeRules.time]
    if (["movingTime", "totalTime", "lapTime"].includes(selectedProperty.value?.value)) return [recipeRules.required, recipeRules.timer]
    if (recipeRules[selectedProperty.value?.type]) return [recipeRules.required, recipeRules[selectedProperty.value?.type]]
    return [recipeRules.required]
})

watch(searchLocations, async (value) => {
    if (loading.value) return
    if (!value || value.length < 5) return
    if (locationInput.value && locationInput.value.address == value) return

    locations.value = []
    await fetchLocationsDebounced(value)
})

/**
 * Returns the operator label with unit-specific text.
 */
const operatorTitle = (item: any) => (user.value.profile.units == "imperial" ? item.impText || item.text : item.text)

/**
 * Reset the dialog state.
 */
const resetData = () => {
    const currentUser = store.user
    const recipes = Object.values(currentUser.recipes)
    const properties = _.cloneDeep(store.recipeProperties)
    const defaults: SelectItem[] = []
    const sports: SelectItem[] = []

    // Only add "defaultFor" options for sports which use has no defaultFor yet.
    for (const sportType of store.sportTypes) {
        const sportName = getSportName(sportType)
        const disabled = _.find(recipes, {defaultFor: sportType})
        defaults.push({value: sportType, text: sportName, disabled})
        sports.push({value: sportType, text: sportName})
    }

    if (sports.length > 0) {
        properties.unshift({value: "defaultFor", text: "Default automation for a specific sport type"})
    }

    // Disable PRO-only properties if user is not PRO.
    if (!currentUser.isPro) {
        properties.forEach((prop: any) => {
            if (prop.isPro) {
                prop.text += " (PRO only)"
                prop.disabled = true
            }
        })
    }

    const garminProp = _.find(properties, {value: "garmin.sensor"})
    if (garminProp && !currentUser.garmin && currentUser.isPro) {
        garminProp.text += " (needs linked Garmin)"
        garminProp.disabled = true
    }

    const wahooProp = _.find(properties, {value: "wahoo.sensor"})
    if (wahooProp && !currentUser.wahoo && currentUser.isPro) {
        wahooProp.text += " (needs linked Wahoo)"
        wahooProp.disabled = true
    }

    const spotifyProp = _.find(properties, {value: "spotify.track"})
    if (spotifyProp && !currentUser.spotify) {
        spotifyProp.text += " (needs linked Spotify)"
        spotifyProp.disabled = true
    }

    const lastfmProp = _.find(properties, {value: "lastfm.track"})
    if (lastfmProp && !currentUser.lastfm) {
        lastfmProp.text += " (needs linked Last.fm)"
        lastfmProp.disabled = true
    }

    const gearMap = (gear: any) => ({value: gear.id, text: gear.name})
    const gear = _.concat(currentUser.profile.bikes || [], currentUser.profile.shoes || []).map(gearMap)

    // Privacy mode disables new records.
    if (currentUser.preferences.privacyMode) {
        const newRecordsProp = properties.find((p: any) => p.value == "newRecords")
        if (newRecordsProp) {
            newRecordsProp.disabled = true
            newRecordsProp.text += " (privacy mode)"
        }
    }

    condition.value = {}
    loading.value = false
    valid.value = true
    recipeProperties.value = properties
    defaultSportTypes.value = defaults
    sportTypes.value = sports
    allGear.value = gear
    booleans.value = [
        {value: true, text: "Yes"},
        {value: false, text: "No"}
    ]
    weekdays.value = [
        {value: 0, text: "Sunday"},
        {value: 1, text: "Monday"},
        {value: 2, text: "Tuesday"},
        {value: 3, text: "Wednesday"},
        {value: 4, text: "Thursday"},
        {value: 5, text: "Friday"},
        {value: 6, text: "Saturday"}
    ]
    selectedSportTypes.value = []
    selectedGear.value = []
    selectedWeekdays.value = []
    selectedBoolean.value = null
    selectedProperty.value = null
    selectedOperator.value = null
    selectedDefaultFor.value = null
    valueInput.value = ""
    valueDateFrom.value = ""
    valueDateTo.value = ""
    locationInput.value = null
    searchLocations.value = ""
    locations.value = []
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
 * Save this condition and close the dialog.
 */
const save = async () => {
    if (!(await validateForm())) return

    let result: any

    if (isDefaultFor.value) {
        result = {defaultFor: selectedDefaultFor.value?.value}
    } else if (!hasOperators.value) {
        result = {property: selectedProperty.value?.value}
    } else {
        result = {
            property: selectedProperty.value?.value,
            operator: selectedOperator.value?.value,
            value: valueInput.value
        }

        if (isBoolean.value) {
            result.operator = "="
            result.value = selectedBoolean.value?.value
            result.friendlyValue = selectedBoolean.value?.text
        } else if (isAny.value) {
            result.value = true
            result.friendlyValue = "set"
        } else if (isSportType.value) {
            result.value = _.map(selectedSportTypes.value, "value").join(",")
            result.friendlyValue = _.map(selectedSportTypes.value, "text").join(" or ")
        } else if (isGear.value) {
            result.value = _.map(selectedGear.value, "value").join(",")
            result.friendlyValue = _.map(selectedGear.value, "text").join(" or ")
        } else if (isWeekday.value) {
            result.value = _.map(selectedWeekdays.value, "value").join(",")
            result.friendlyValue = _.map(selectedWeekdays.value, "text").join(" or ")
        } else if (isLocation.value) {
            result.value = locationInput.value.value
            result.friendlyValue = locationInput.value.address
        } else if (isDateRange.value) {
            result.value = `${valueDateFrom.value},${valueDateTo.value}`
            const year = new Date().getFullYear()
            const fromDate = valueDateFrom.value.length == 5 ? dayjs(`${year}-${valueDateFrom.value}`).format("MMM D") : dayjs(valueDateFrom.value).format("MMM D, YYYY")
            const toDate = valueDateTo.value.length == 5 ? dayjs(`${year}-${valueDateTo.value}`).format("MMM D") : dayjs(valueDateTo.value).format("MMM D, YYYY")
            result.friendlyValue = `From ${fromDate} to ${toDate}`
        } else if (selectedProperty.value?.type == "time") {
            const arrTime = result.value.split(":")
            if (isPace.value) {
                result.value = parseInt(arrTime[0]) * 60 + parseInt(arrTime[1])
            } else {
                result.value = parseInt(arrTime[0]) * 3600 + parseInt(arrTime[1]) * 60
            }
            result.friendlyValue = valueInput.value
        }
    }

    emit("closed", result)
    resetData()
}

/**
 * Select default values when the property changes.
 */
const propertyChanged = () => {
    if (isDefaultFor.value || !hasOperators.value) {
        selectedOperator.value = {value: "=", text: "is"}
        selectedBoolean.value = {value: true, text: "Yes"}
    } else if (selectedProperty.value?.operators.length == 1) {
        selectedOperator.value = selectedProperty.value?.operators?.[0] || null
    } else {
        selectedOperator.value = null
    }
}

/**
 * Save on Enter.
 */
const valueKeyUp = (event: KeyboardEvent) => {
    if (event.key == "Enter") {
        save()
    }
}

/**
 * Fetch matching locations from the maps geocoder.
 */
const fetchLocations = async (value: string) => {
    try {
        locationInput.value = null

        // User typed the coordinates directly?
        if (_.isString(value) && value.indexOf(",") > 0) {
            const arrValue = decodeURIComponent(value).split(",")
            let lat: any = arrValue[0].trim()
            let long: any = arrValue[1].trim()

            if (arrValue.length == 2 && !isNaN(lat) && !isNaN(long)) {
                lat = parseFloat(lat)
                long = parseFloat(long)

                if (lat >= -90 && lat <= 90 && long >= -180 && long <= 180) {
                    const option = {value: [lat, long], address: `Coordinates ${lat}, ${long}`}
                    locations.value = [option]
                    locationInput.value = option
                    return
                }
            }
        }

        loading.value = true
        const data: any[] = await api(`/api/maps/${user.value.id}/geocode`, {query: {address: value}})

        for (const loc of data) {
            loc.value = [loc.latitude, loc.longitude]
        }

        loading.value = false
        locations.value = data
    } catch (ex) {
        loading.value = false
        webError("AddCondition.fetchLocations", ex)
    }
}

/**
 * Debounce geocoder searches.
 */
const fetchLocationsDebounced = async (value: string) => {
    if (searchTimerId) clearTimeout(searchTimerId)

    searchTimerId = window.setTimeout(async () => {
        if (searchLocations.value.length < 5) return
        await fetchLocations(value)
    }, 1000)
}

resetData()
</script>
