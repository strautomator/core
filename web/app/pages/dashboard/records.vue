<template>
    <div>
        <v-container fluid>
            <h1>Personal records</h1>

            <v-snackbar v-model="savedRecord" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                {{ editRecordSport }} - {{ camelCaseName(editRecordField) }} new record:{{ editRecordValue }}!
                <template #actions>
                    <v-icon @click="savedRecord = false">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>

            <v-card v-if="!records" variant="outlined">
                <v-card-text class="text-center text-md-left">
                    <template v-if="isPrivacyMode">
                        <div class="text-center">
                            <div>
                                <v-icon class="mb-4" size="x-large">mdi-cancel</v-icon>
                            </div>
                            Privacy mode is enabled on your account settings. Please disable it if you wish to track your personal records with Strautomator.
                        </div>
                    </template>
                    <template v-else-if="refreshing">
                        <div class="text-center text-md-left">
                            <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                            Fetching your activity records, please wait...
                        </div>
                        <v-alert class="mt-5 text-center text-md-left" color="accent" border="top">This is a long process and can take up to 4 minutes to complete!</v-alert>
                    </template>
                    <template v-else-if="noRecords">
                        <div class="text-center">
                            <div>
                                <v-icon class="mb-4" size="x-large">mdi-cancel</v-icon>
                            </div>
                            No personal records could be extracted from your activities. Please try again after you've registered at least 10 activities on Strava.
                        </div>
                    </template>
                    <template v-else>
                        <div>
                            Strautomator can keep track of your personal records!
                            <br v-if="mdAndUp" />
                            Want to enable the feature? Start now by fetching your existing activity records.
                        </div>
                        <v-btn class="mt-4" color="primary" title="Process my activity records" @click="refreshRecords" rounded>
                            <v-icon start>mdi-tray-arrow-down</v-icon>
                            Fetch activity records
                        </v-btn>
                    </template>
                </v-card-text>
            </v-card>

            <template v-else-if="refreshing">
                <div class="text-center text-md-left">
                    <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                    Refreshing activity records, please wait...
                </div>
                <v-alert class="mt-5 text-center text-md-left" color="accent" border="top">This is a long process and can take up to 4 minutes to complete!</v-alert>
            </template>

            <template v-else>
                <v-card class="mb-5" v-for="recordEntry in records" :key="recordEntry[0]" variant="outlined">
                    <v-card-title class="bg-accent">
                        <v-icon class="mr-2">{{ getSportIcon(recordEntry[0]) }}</v-icon>
                        {{ camelCaseName(recordEntry[0]) }}
                    </v-card-title>
                    <v-card-text class="pa-0">
                        <v-table :class="{'mt-2': !mdAndUp}">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Best</th>
                                    <th v-if="mdAndUp">2nd Best</th>
                                    <th v-if="mdAndUp">Date</th>
                                    <th class="text-center pr-0 pl-0" width="1">Activity</th>
                                    <th class="text-center pr-0 pl-0" width="1" v-if="mdAndUp">Edit</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="mb-1" v-for="recordField in getRecordFields(recordEntry[1])" :key="'td-' + recordField">
                                    <td class="text-capitalize">
                                        <v-icon class="mr-1" :size="!mdAndUp ? 'small' : undefined">{{ getRecordIcon(recordField) }}</v-icon>
                                        <span :class="!mdAndUp ? 'text-caption' : ''">{{ camelCaseName(recordField) }}</span>
                                    </td>
                                    <td>
                                        <a @click="showEditDialog(recordEntry, recordField)">{{ getRecordValue(recordEntry[1], recordField) }}</a>
                                    </td>
                                    <td class="text-grey" v-if="mdAndUp">
                                        {{ getRecordValue(recordEntry[1], recordField, true) }}
                                    </td>
                                    <td v-if="mdAndUp">
                                        {{ recordEntry[1][recordField] ? $dayjs(recordEntry[1][recordField].date).format(mdAndUp ? "lll" : "ll") : "-" }}
                                    </td>
                                    <td class="text-center">
                                        <template v-if="recordHasActivity(recordEntry, recordField)">
                                            <a title="Go to Strava" target="strava" :href="`https://www.strava.com/activities/${recordEntry[1][recordField].activityId}`"><v-icon color="primary">mdi-open-in-new</v-icon></a>
                                        </template>
                                        <span v-else><v-icon title="Unknown activity" color="grey">mdi-help-box</v-icon></span>
                                    </td>
                                    <td class="text-center" v-if="mdAndUp">
                                        <v-icon title="Edit record value" color="primary" @click="showEditDialog(recordEntry, recordField)">mdi-pencil-outline</v-icon>
                                    </td>
                                </tr>
                            </tbody>
                        </v-table>
                    </v-card-text>
                </v-card>

                <v-card variant="outlined">
                    <v-card-text class="text-center text-md-left">
                        <p>
                            Your personal records are updated automatically with each new Strava activity.
                            <br v-if="mdAndUp" />
                            If for some reason you think the records shown above are wrong or outdated, you can manually refresh them.
                        </p>
                        <v-btn class="mt-2" color="primary" title="Refresh my activity records" @click="refreshRecords" rounded>
                            <v-icon start>mdi-refresh</v-icon>
                            Refresh my records
                        </v-btn>
                    </v-card-text>
                </v-card>
            </template>

            <v-alert v-if="refreshError" class="mt-5 text-center text-md-left" color="error" border="top">{{ refreshError }}</v-alert>
        </v-container>

        <v-dialog v-model="editDialog" width="400" opacity="0.95">
            <v-card>
                <v-toolbar color="primary">
                    <v-toolbar-title>
                        <v-icon class="mr-1">{{ getSportIcon(editRecordSport) }}</v-icon>
                        <v-icon class="mr-1">{{ getRecordIcon(editRecordField) }}</v-icon>
                        <span class="text-capitalize">{{ camelCaseName(editRecordField) }}</span>
                    </v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="hideEditDialog"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <v-form ref="editForm">
                        <p class="mt-3">Sport: {{ camelCaseName(editRecordSport) }}</p>
                        <p>Enter the new record below. Your previous record will be erased, as well as its referenced activity ID.</p>
                        <div>
                            <v-text-field v-model="editRecordValue" label="New record" maxlength="10" :loading="savingRecord" :suffix="editRecordSuffix" validate-on="blur" variant="outlined" rounded></v-text-field>
                        </div>
                    </v-form>
                    <div class="text-right">
                        <v-spacer></v-spacer>
                        <v-btn class="mr-2" color="grey" title="Stay here" @click.stop="hideEditDialog" variant="text" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Cancel
                        </v-btn>
                        <v-btn color="primary" title="Save new record value" :disabled="editRecordValue.length < 1" @click="saveRecord" rounded>
                            <v-icon start>mdi-check</v-icon>
                            Save
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

useHead({title: "Personal records"})

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user, isPrivacyMode} = useUser()
const {getSportIcon, getRecordIcon} = useStrava()

const refreshing = ref(false)
const refreshError = ref<string>(null)
const noRecords = ref(false)
const savedRecord = ref(false)
const savingRecord = ref(false)
const editDialog = ref(false)
const editRecordSport = ref("")
const editRecordField = ref("")
const editRecordValue = ref<any>("")
const editRecordSuffix = ref("")
const athleteRecordsRefreshed = useCookie("athlete-records-refreshed", {path: "/", maxAge: 60 * 60 * 12})

const records = computed(() => {
    const athleteRecords = store.athleteRecords
    if (!athleteRecords) return null

    return _.sortBy(Object.entries(athleteRecords), (r: any) => r[0].replace("Virtual", ""))
})

const recordHasActivity = (recordEntry: any, recordField: string) => recordEntry[1][recordField] && recordEntry[1][recordField].activityId

const camelCaseName = (field: string) => {
    const result = field.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())
    return result.replace("Hr", "HR")
}

const getRecordFields = (recordDetails: any) => Object.keys(recordDetails).sort()

/**
 * Get a formatted record value.
 */
const getRecordValue = (recordDetails: any, field: string, previous?: boolean) => {
    const targetProp = previous ? "previous" : "value"
    const property: any = _.find(store.recipeProperties, {value: field})

    if (!recordDetails[field] || !recordDetails[field][targetProp]) return "-"

    let result = field.includes("Time") ? (recordDetails[field][targetProp] / 3600).toFixed(1) : recordDetails[field][targetProp]

    if (property && !previous) {
        const suffix = store.user.profile.units == "imperial" ? property.impSuffix || property.suffix : property.suffix
        if (suffix) {
            result += ` ${suffix}`
        }
    }

    return result
}

/**
 * Refresh athlete records from Strava.
 */
const refreshRecords = async () => {
    try {
        const waitMessage = "Your records were recently refreshed, please wait at least 24 hours"
        const timestamp = Math.round(new Date().valueOf() / 1000)

        if (athleteRecordsRefreshed.value) {
            refreshError.value = waitMessage
            return
        }

        refreshing.value = true
        refreshError.value = null

        const newRecords: any = await api(`/api/strava/${user.value.id}/athlete-records/refresh`)

        if (!newRecords) {
            noRecords.value = true
            refreshError.value = "No personal records were found"
        } else if (newRecords.recentlyRefreshed) {
            refreshError.value = waitMessage
        } else {
            store.setAthleteRecords(newRecords)
            athleteRecordsRefreshed.value = timestamp.toString()
        }
    } catch (ex) {
        webError("Records.fetch", ex)
    }

    refreshing.value = false
}

/**
 * Open the edit dialog for the selected record.
 */
const showEditDialog = (recordEntry: any, recordField: string) => {
    savedRecord.value = false

    const recordValue = recordEntry[1][recordField].value
    const suffixProperty: any = _.find(store.recipeProperties, {value: recordField})

    editRecordSuffix.value = store.user.profile.units == "imperial" ? suffixProperty.impSuffix || suffixProperty.suffix : suffixProperty.suffix
    if (!editRecordSuffix.value) editRecordSuffix.value = ""

    editRecordSport.value = recordEntry[0]
    editRecordField.value = recordField
    editRecordValue.value = recordField.includes("Time") ? (recordValue / 3600).toFixed(1) : recordValue
    editDialog.value = true
}

const hideEditDialog = () => {
    savingRecord.value = false
    editDialog.value = false
}

/**
 * Save a manually edited record value.
 */
const saveRecord = async () => {
    try {
        savingRecord.value = true

        const currentRecords = _.cloneDeep(store.athleteRecords)
        const previous = currentRecords[editRecordSport.value][editRecordField.value].previous
        const value = editRecordField.value.includes("Time") ? Math.round(parseFloat(editRecordValue.value) * 3600) : editRecordValue.value

        const data: any = {field: editRecordField.value, value: value}
        if (value < previous) {
            data.previous = value
        }

        const result = await api(`/api/strava/${user.value.id}/athlete-records/${editRecordSport.value}`, {method: "POST", body: data})
        store.setAthleteRecords(_.defaultsDeep(result, currentRecords))

        hideEditDialog()
        savedRecord.value = true
    } catch (ex) {
        webError("Records.saveRecord", ex)
    }
}
</script>
