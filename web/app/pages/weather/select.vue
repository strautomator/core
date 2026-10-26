<template>
    <div>
        <v-container fluid>
            <h1>Weather comparison</h1>
            <template v-if="user && !user.isPro">
                <p>The full selection of weather providers is available to PRO accounts only.</p>
                <div class="mt-6 text-center text-md-left">
                    <v-btn color="primary" to="/billing" title="Subscribe and become a PRO!" rounded>
                        <v-icon start>mdi-credit-card-outline</v-icon>
                        Subscribe to PRO
                    </v-btn>
                </div>
            </template>
            <template v-else-if="positionFailed">
                <v-alert border="top" color="error">
                    Failed to get your current location. Please make sure you have authorized the Strautomator website to get your geolocation with this browser, and if necessary, try again with a different browser.
                </v-alert>
            </template>
            <template v-else-if="weatherSummaries.length == 0">
                <p>Not sure which weather provider is the best on your area? Strautomator can query all of them for the current weather conditions on your location, so then you can select the one presenting the most accurate results.</p>
                <div :class="{'text-center mt-6': !mdAndUp}">
                    <v-btn class="mr-2" color="primary" title="Get weather for my current location" v-if="!loading" @click="getPosition" rounded>
                        <v-icon start>mdi-weather-sunset-down</v-icon>
                        Get current weather
                    </v-btn>
                    <v-progress-circular size="32" width="2" v-if="loading" indeterminate></v-progress-circular>
                </div>
            </template>
            <template v-else>
                <div>Which weather provider has the most accurate readings on your location?</div>
                <div class="text-caption">Coordinates {{ coordinates.join(" - ") }}, timezone offset {{ tzOffset }}min</div>
                <v-radio-group v-model="weatherProvider">
                    <v-table v-if="mdAndUp">
                        <thead>
                            <tr>
                                <th>Provider</th>
                                <th></th>
                                <th>Temperature</th>
                                <th>Humidity</th>
                                <th>Precipitation</th>
                                <th>Wind</th>
                                <th>Selected</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr :class="{'text-white': weatherProvider != summary.id, 'text-primary': weatherProvider == summary.id}" v-for="summary in weatherSummaries" :key="summary.id">
                                <td @click="setProvider(summary.id)">{{ summary.name }}</td>
                                <td class="text-h5">{{ summary.icon }}</td>
                                <td>{{ summary.temperature }} (feels {{ summary.feelsLike }})</td>
                                <td>{{ summary.humidity }}</td>
                                <td>{{ summary.precipitation || "-" }}</td>
                                <td>{{ summary.windSpeed }} / {{ summary.windGust }}</td>
                                <td><v-radio class="float-right" :title="`Click to select ${summary.name}`" :value="summary.id"></v-radio></td>
                            </tr>
                        </tbody>
                    </v-table>
                    <div v-else>
                        <v-card class="mb-2" v-for="summary in weatherSummaries" :key="summary.id">
                            <v-card-text>
                                <div class="text-subtitle-1">
                                    <span :class="{'text-white': weatherProvider != summary.id, 'text-primary': weatherProvider == summary.id}" @click="setProvider(summary.id)">{{ summary.name }}</span>
                                    <div class="float-right mt-1 mr-n2">
                                        <v-radio :value="summary.id"></v-radio>
                                    </div>
                                </div>
                                <div class="d-flex pa-0 mt-2">{{ summary.icon }} {{ summary.summary }} {{ summary.precipitation && !summary.summary.toLowerCase().includes(summary.precipitation) ? `(${summary.precipitation})` : "" }}</div>
                                <div class="d-flex pa-0 mt-1">
                                    <div class="mr-3 ml-n1">
                                        <v-icon size="small">mdi-thermometer</v-icon>
                                        {{ summary.temperature }} ({{ summary.feelsLike }})
                                    </div>
                                    <div class="mr-3">
                                        <v-icon size="small">mdi-water-percent</v-icon>
                                        {{ summary.humidity }}
                                    </div>
                                    <div class="mr-3">
                                        <v-icon size="small">mdi-weather-windy</v-icon>
                                        {{ summary.windSpeed }} ({{ summary.windGust }})
                                    </div>
                                </div>
                            </v-card-text>
                        </v-card>
                    </div>
                </v-radio-group>
                <div class="mt-1 text-center text-md-left">
                    <v-btn color="primary" title="Save weather provider" @click="saveAndExit" :disabled="!weatherProvider" rounded>
                        <v-icon start>mdi-check</v-icon>
                        Confirm {{ weatherProvider }}
                    </v-btn>
                </div>
            </template>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

useHead({title: "Weather comparison"})

const api = useApi()
const store = useMainStore()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()

const loading = ref(false)
const positionFailed = ref(false)
const weatherProvider = ref(store.user.preferences.weatherProvider || "openmeteo")
const weatherSummaries = ref<any[]>([])
const coordinates = ref<string[]>([])
const tzOffset = new Date().getTimezoneOffset() * -1

const setProvider = (id: string) => (weatherProvider.value = id)

/**
 * Request browser geolocation.
 */
const getPosition = () => {
    loading.value = true
    navigator.geolocation.getCurrentPosition(getWeather, positionError, {maximumAge: 3600000, timeout: 10000, enableHighAccuracy: false})
}

/**
 * Handle browser geolocation errors.
 */
const positionError = (err: GeolocationPositionError) => {
    loading.value = false
    positionFailed.value = true
    console.error(err)
}

/**
 * Load weather summaries for the current coordinates.
 */
const getWeather = async (position: GeolocationPosition) => {
    try {
        const summaries = []
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        const result: any = await api(`/api/weather/${user.value.id}/coordinates/${latitude.toFixed(4)},${longitude.toFixed(4)}/${tzOffset}`)

        // Iterate weather summaries to set the provider name and append to the weatherSummaries list.
        for (const id of Object.keys(result)) {
            result[id].id = id
            result[id].name = _.find(store.weatherProviders, {value: id})?.title
            summaries.push(result[id])
        }

        weatherSummaries.value = summaries
        coordinates.value = [latitude.toFixed(4), longitude.toFixed(4)]
        loading.value = false
    } catch (ex) {
        webError("Weather.getWeather", ex)
    }
}

/**
 * Save the selected weather provider preference.
 */
const savePreferences = async () => {
    try {
        const data = {weatherProvider: weatherProvider.value}

        await api(`/api/users/${user.value.id}/preferences`, {method: "POST", body: data})

        store.setUserPreferences(data)
    } catch (ex) {
        webError("Weather.savePreferences", ex)
    }
}

/**
 * Save the preference and return to the account page.
 */
const saveAndExit = async () => {
    await savePreferences()
    await navigateTo({path: "/account"})
}
</script>
