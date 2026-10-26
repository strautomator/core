<template>
    <div>
        <v-container fluid>
            <h1>Upload FIT files</h1>

            <v-alert class="mt-4" border="top" v-if="!user.isPro" border-color="error">
                <div class="mt-1">Uploading FIT files is a PRO feature.</div>
                <v-btn class="mt-3" color="primary" title="Subscribe to PRO" to="/billing" size="small" rounded>
                    <v-icon start>mdi-star</v-icon>
                    Get PRO
                </v-btn>
            </v-alert>

            <template v-else-if="!processing && !finished">
                <div class="mb-4">
                    Just linked your Garmin or Wahoo account? You can send your older activities to Strautomator by uploading them with a ZIP file. Useful in case you want to process older activities with automations that rely on sensors IDs or other
                    FIT-only data.
                </div>

                <ul class="ml-0 pl-4 pb-0 mb-4 mt-4">
                    <li>Export the FIT files from Garmin Connect or from the Wahoo app, and put them all in a single ZIP archive.</li>
                    <li>Up to {{ maxFiles }} FIT files per archive, with a maximum archive size of {{ maxSizeMB }}MB.</li>
                    <li>Files are extracted and processed one by one, so bigger archives simply take longer.</li>
                    <li>The parsed FIT data will be deleted from our database after some days.</li>
                </ul>

                <v-card class="mt-6" variant="outlined">
                    <v-card-text class="pb-0">
                        <v-file-input
                            v-model="file"
                            label="ZIP archive with your FIT files"
                            accept=".zip,application/zip"
                            prepend-icon="mdi-folder-zip"
                            :error-messages="fileError"
                            variant="outlined"
                            rounded
                            density="compact"
                            show-size
                        ></v-file-input>
                        <div class="text-center text-md-right mb-4">
                            <v-btn color="primary" title="Upload and process the FIT files" @click="uploadFile" :disabled="!selectedFile" rounded>
                                <v-icon start>mdi-upload</v-icon>
                                Upload and process
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </template>

            <template v-else-if="processing">
                <v-card class="mt-4" variant="outlined">
                    <v-card-title class="bg-accent">Processing your activities</v-card-title>
                    <v-card-text class="pt-4">
                        <div class="mb-2">{{ progressText }}</div>
                        <v-progress-linear :model-value="progressValue" color="primary" height="12" rounded striped></v-progress-linear>
                        <div class="mt-4" v-if="results.length > 0">
                            <div class="text-caption" v-for="(result, index) in latestResults" :key="`processing-${index}`">
                                <v-icon class="mr-1" size="small">{{ getSourceIcon(result) }}</v-icon>
                                {{ result.filename }}
                            </div>
                        </div>
                    </v-card-text>
                </v-card>
            </template>

            <template v-else>
                <v-alert class="mt-4" border="top" color="error" v-if="jobError">
                    {{ jobError }}
                </v-alert>

                <v-card class="mt-4" variant="outlined">
                    <v-card-title class="bg-accent">{{ summaryTitle }}</v-card-title>
                    <v-card-text class="pt-4">
                        <p v-if="processedResults.length == 0">No valid Garmin or Wahoo FIT files were found in the uploaded archive.</p>
                        <v-table v-else>
                            <thead v-if="mdAndUp">
                                <tr>
                                    <th></th>
                                    <th>Activity</th>
                                    <th>Distance</th>
                                    <th>Total time</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(result, index) in processedResults" :key="`processed-${index}`">
                                    <td width="1">
                                        <v-icon :title="result.source">{{ getSourceIcon(result) }}</v-icon>
                                    </td>
                                    <td>
                                        <div class="mt-2 mb-2">
                                            {{ result.name }}
                                            <br />
                                            {{ $dayjs(result.dateStart).format("lll") }}
                                        </div>
                                    </td>
                                    <td>{{ getDistance(result) }}</td>
                                    <td>{{ getDuration(result.totalTime) }}</td>
                                </tr>
                            </tbody>
                        </v-table>

                        <div class="mt-6" v-if="failedResults.length > 0">
                            <div class="font-weight-bold mb-2">{{ failedResults.length }} file(s) could not be processed</div>
                            <ul class="ml-0 pl-4">
                                <li v-for="(result, index) in failedResults" :key="`failed-${index}`">{{ result.filename }}: {{ result.error }}</li>
                            </ul>
                        </div>

                        <div class="mt-6">
                            <v-btn class="mr-2 mb-2" color="primary" title="Upload another archive" @click="reset" size="small" rounded>
                                <v-icon start>mdi-upload</v-icon>
                                Upload another archive
                            </v-btn>
                            <v-btn class="mb-2" color="primary" title="Go to my recent activities" to="/activities/recent" size="small" rounded variant="outlined">
                                <v-icon start>mdi-history</v-icon>
                                Recent activities
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </template>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Upload FIT files"})

const api = useApi()
const webError = useWebError()
const store = useMainStore()
const {mdAndUp} = useDisplay()
const {user} = useUser()
const {$dayjs}: any = useNuxtApp()

const file = ref<File | File[] | null>(null)
const fileError = ref<string>(null)
const processing = ref(false)
const finished = ref(false)
const uploadPercent = ref(0)
const total = ref(0)
const results = ref<any[]>([])
const jobError = ref<string>(null)
const maxSize = ref(20000000)
const maxFiles = ref(50)

const selectedFile = computed(() => (Array.isArray(file.value) ? file.value[0] : file.value))
const maxSizeMB = computed(() => Math.round(maxSize.value / 1024 / 1024))
const progressValue = computed(() => (total.value > 0 ? Math.round((results.value.length / total.value) * 100) : uploadPercent.value))
const progressText = computed(() => {
    if (total.value > 0) {
        return `Parsing the FIT files... ${results.value.length} of ${total.value} processed.`
    }
    if (uploadPercent.value < 100) {
        return `Uploading your archive... ${uploadPercent.value}%`
    }
    return "Extracting the FIT files from your archive..."
})
const latestResults = computed(() => results.value.slice(-5).reverse())
const processedResults = computed(() => results.value.filter((r) => !r.error))
const failedResults = computed(() => results.value.filter((r) => r.error))
const summaryTitle = computed(() => `${processedResults.value.length} activities processed`)

const getSourceIcon = (result: any) => {
    if (result.error) return "mdi-alert-circle-outline"
    return result.source == "wahoo" ? "mdi-alpha-w-circle" : "mdi-triangle"
}

const getDistance = (result: any) => {
    if (!result.distance) return "-"
    const imperial = user.value.profile.units == "imperial"
    const distance = imperial ? result.distance * 0.621371 : result.distance
    return `${distance.toFixed(1)} ${imperial ? "mi" : "km"}`
}

const getDuration = (seconds: number) => {
    if (!seconds) return "-"
    const duration = $dayjs.duration(seconds, "seconds")
    let hours: any = Math.floor(duration.asHours())
    let minutes: any = duration.minutes()
    if (hours < 10) hours = `0${hours}`
    if (minutes < 10) minutes = `0${minutes}`
    return `${hours}:${minutes}`
}

/**
 * Reset the upload state.
 */
const reset = () => {
    file.value = null
    fileError.value = null
    processing.value = false
    finished.value = false
    uploadPercent.value = 0
    total.value = 0
    results.value = []
    jobError.value = null
}

/**
 * Upload the ZIP file as raw application/zip and parse the streamed NDJSON response.
 */
const uploadFile = () => {
    const currentFile = selectedFile.value
    if (!currentFile) return

    if (currentFile.size > maxSize.value) {
        fileError.value = `The archive is bigger than ${maxSizeMB.value}MB`
        return
    }

    fileError.value = null
    jobError.value = null
    results.value = []
    total.value = 0
    uploadPercent.value = 0
    processing.value = true

    // Results are streamed back as NDJSON, so we keep track of how much of the
    // response was already consumed and parse only the newly arrived lines.
    let parsedLength = 0
    const xhr = new XMLHttpRequest()

    const consume = () => {
        const text = xhr.responseText || ""
        const boundary = text.lastIndexOf("\n")
        if (boundary < parsedLength) return

        const lines = text.substring(parsedLength, boundary).split("\n")
        parsedLength = boundary + 1

        for (const line of lines) {
            if (!line.trim()) continue

            let data: any
            try {
                data = JSON.parse(line)
            } catch (ex) {
                continue
            }

            if (data.type == "start") {
                total.value = data.total
            } else if (data.type == "file") {
                results.value.push(data.result)
            } else if (data.type == "end") {
                results.value = data.results
            } else if (data.type == "error") {
                jobError.value = data.message
            }
        }
    }

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            uploadPercent.value = Math.round((e.loaded / e.total) * 100)
        }
    }
    xhr.onprogress = consume
    xhr.onerror = () => {
        jobError.value = "The upload has failed, please try again."
        processing.value = false
        finished.value = true
    }
    xhr.onload = () => {
        if (xhr.status == 200) {
            consume()
        } else {
            let message = `Failed to process the archive (status ${xhr.status}).`
            try {
                message = JSON.parse(xhr.responseText).message || message
            } catch (ex) {
                // Response was not a JSON error.
            }
            jobError.value = message
        }

        processing.value = false
        finished.value = true
    }

    xhr.open("POST", `/api/fitupload/${user.value.id}/zip`)
    xhr.setRequestHeader("Authorization", `Bearer ${store.oauth.accessToken}`)
    xhr.setRequestHeader("Content-Type", "application/zip")
    xhr.send(currentFile)
}

/**
 * Load FIT upload limits.
 */
const loadLimits = async () => {
    try {
        const limits: any = await api("/api/fitupload/limits")
        maxSize.value = limits.maxSize
        maxFiles.value = limits.maxFiles
    } catch (ex) {
        webError("FitUpload.fetch", ex)
    }
}

onMounted(loadLimits)
</script>
