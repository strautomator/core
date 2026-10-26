<template>
    <div>
        <v-container fluid>
            <h1>Upcoming Events Map</h1>
            <v-card class="mt-5" v-if="user" variant="outlined">
                <v-card-text>
                    <div class="mt-1 text-center text-md-left" v-if="loading">
                        <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate></v-progress-circular>
                        Loading upcoming club events, weather and routes, please wait, this can take up to 2 minutes...
                    </div>
                    <div class="googlemaps-canvas" ref="googlemaps" v-if="events && events.length > 0"></div>
                    <div v-if="!loading && events">
                        <v-sheet class="d-flex flex-column flex-md-row pl-2 pt-3 pt-md-4" color="accent">
                            <div class="flex-grow-0 ma-0 pa-0">
                                <v-checkbox v-model="mapOptionTraffic" class="ma-0 pa-0" label="Show traffic and road blocks" density="compact" />
                            </div>
                            <div class="flex-grow-1 ma-0 pa-0 mt-n2 mt-md-0 ml-md-6 mb-n2">
                                <v-checkbox v-model="mapOptionBicycling" class="ma-0 pa-0" label="Show cycling lanes and paths" density="compact" />
                            </div>
                        </v-sheet>

                        <template v-if="events.length > 0">
                            <v-table v-if="mdAndUp">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>Date (next {{ days }} days)</th>
                                        <th>Title</th>
                                        <th class="text-center">Details</th>
                                        <th class="text-center">
                                            Weather<sup>{{ user.isPro ? "" : "*" }}</sup>
                                        </th>
                                        <th class="text-center">Joined</th>
                                        <th class="text-right">Map</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="ed in eventDates" :key="ed.date + ed.event.id">
                                        <td class="text-left">
                                            <v-icon>{{ getSportIcon(ed.event.type) }}</v-icon>
                                        </td>
                                        <td class="pt-2 pb-2" nowrap>
                                            {{ $dayjs(ed.date).format("ddd, DD MMM YYYY, HH:mm") }}
                                        </td>
                                        <td class="pt-2 pb-2">
                                            <a @click="tableRouteClick(ed.event)" @mouseover="mapHighlightRoute(ed.event, true)" @mouseout="mapHighlightRoute(ed.event, false)">{{ ed.event.title }}</a>
                                            <v-icon color="primary" size="small" v-if="ed.event.route">mdi-download</v-icon>
                                        </td>
                                        <td class="pt-2 pb-2 text-center">
                                            {{ getDistance(ed.event) }}
                                            <br />
                                            {{ getEstimatedHours(ed.event) }}
                                        </td>
                                        <td class="pt-2 pb-2 text-center">
                                            <template v-if="!user.isPro">-</template>
                                            <template v-else-if="ed.event.route">
                                                <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate v-if="loadingWeather"></v-progress-circular>
                                                <template v-else-if="ed.weather.length == 0">-</template>
                                                <div v-else>
                                                    <template v-for="icon in ed.weatherIcons">
                                                        {{ icon }}
                                                    </template>
                                                    <div class="text-caption">
                                                        <template v-if="ed.minTemperature == ed.maxTemperature">{{ ed.minTemperature }}</template>
                                                        <template v-else>{{ ed.minTemperature }} / {{ ed.maxTemperature }}</template>
                                                    </div>
                                                </div>
                                            </template>
                                            <template v-else>-</template>
                                        </td>
                                        <td class="pt-2 pb-2 text-center">
                                            <v-icon class="mt-n1" v-if="ed.event.joined && ed.date == ed.event.dates[0]">mdi-check-circle</v-icon>
                                            <span v-else>-</span>
                                        </td>
                                        <td class="pt-2 pb-2">
                                            <v-checkbox class="float-right mr-n1 mt-1" title="Visible on the map" v-model="ed.event.visible" :disabled="ed.event.noMap" @click="tableRouteToggle(ed.event)" density="compact" />
                                        </td>
                                    </tr>
                                </tbody>
                            </v-table>
                            <div class="mt-4" v-else>
                                <div class="text-truncate mt-3" v-for="ed in eventDates" :key="ed.date + ed.event.id">
                                    <v-icon class="mt-n1 mr-1" size="small">{{ getSportIcon(ed.event.type) }}</v-icon>
                                    <span class="mr-2">{{ $dayjs(ed.date).format("ddd, DD MMM YYYY, HH:mm") }}</span>
                                    <v-icon v-if="ed.event.joined" size="small">mdi-check-circle</v-icon>
                                    <v-progress-circular class="mr-1 mt-n1" size="16" width="2" indeterminate v-if="loadingWeather"></v-progress-circular>
                                    <div class="ml-1 float-right text-right" v-else>
                                        <div>{{ user.isPro ? ed.weatherIcons.join(" ") : "" }}</div>
                                        <div class="text-caption">
                                            <template v-if="ed.minTemperature == ed.maxTemperature">{{ ed.minTemperature }}</template>
                                            <template v-else>{{ ed.minTemperature }} / {{ ed.maxTemperature }}</template>
                                        </div>
                                    </div>
                                    <br />
                                    <a @click="tableRouteClick(ed.event)">{{ ed.event.title }}</a>
                                    <br />
                                    <v-chip class="mr-1" v-if="!ed.event.route" size="x-small">-</v-chip>
                                    <v-chip class="mr-1" v-if="ed.event.route" size="x-small">{{ getDistance(ed.event) }}</v-chip>
                                    <v-chip class="mr-1" v-if="ed.event.route" size="x-small">{{ getEstimatedHours(ed.event) }}</v-chip>
                                    <v-divider class="mt-3 mb-1"></v-divider>
                                </div>
                            </div>
                            <div class="text-caption text-md-right" v-if="!user.isPro">* Weather forecast is available to PRO users</div>
                            <div class="text-center text-md-left mt-4 mt-md-3">
                                <v-btn color="primary" title="Download routes" @click.stop="showDownloadDialog" :disabled="!routeIds || !user.isPro" size="small" rounded>
                                    <v-icon start>mdi-folder-download</v-icon>
                                    {{ !routeIds ? "No routes to download" : !user.isPro ? "Download routes (PRO only)" : "Download routes" }}
                                </v-btn>
                            </div>
                        </template>
                        <div v-else>
                            <p>Oh, crap... your clubs have no upcoming events planned for the next {{ days }} days.</p>
                            <v-alert border="top" color="accent" class="mb-0" v-if="!user.isPro">
                                <div>PRO accounts can access up to the next {{ store.proPlanDetails.futureCalendarDays }} days on the calendar!</div>
                                <v-btn color="primary" class="mt-4" to="/billing" title="Subscribe to get a PRO account!" rounded>
                                    <v-icon start>mdi-credit-card</v-icon>
                                    Subscribe to PRO
                                </v-btn>
                            </v-alert>
                        </div>
                    </div>
                </v-card-text>
            </v-card>
            <v-alert v-if="user && !user.isPro" border="top" border-color="primary" class="mt-4">
                <div class="mt-1 text-center text-md-left">
                    Free accounts do not support Komoot, detailed weather reports or downloads.
                    <br />
                    <nuxt-link to="/billing" title="Upgrade to PRO!">Upgrade to PRO</nuxt-link>
                    to unlock all the available map features.
                </div>
            </v-alert>

            <v-dialog v-model="downloadDialog" width="440" opacity="0.95">
                <v-card>
                    <v-toolbar color="primary">
                        <v-toolbar-title>Download routes</v-toolbar-title>
                        <v-spacer></v-spacer>
                        <v-toolbar-items>
                            <v-btn icon="mdi-close" @click.stop="hideDownloadDialog"></v-btn>
                        </v-toolbar-items>
                    </v-toolbar>
                    <v-card-text>
                        <p class="mt-2">A total of {{ routeIds ? routeIds.length : 0 }} GPX routes for your upcoming events will be fetched from Strava and compressed into a single ZIP file.</p>
                        <p class="mt-1">Komoot routes are not supported.</p>
                        <div class="text-right">
                            <v-spacer></v-spacer>
                            <v-btn class="mr-2" color="grey" title="Cancel and do not reset" @click.stop="hideDownloadDialog" variant="text" rounded>
                                <v-icon start>mdi-cancel</v-icon>
                                Cancel
                            </v-btn>
                            <v-btn color="primary" title="Download ZIP with GPX routes" @click="downloadRoutes" rounded>
                                <v-icon start>mdi-folder-download</v-icon>
                                Download
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </v-dialog>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs"
import _ from "lodash"

declare global {
    interface Window {
        google?: any
        initUpcomingEventsMap?: () => void
    }
}

useHead({title: "Upcoming Events Map"})

let zIndexMax = 100
const fullscreenEvents = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"]
const mapRouteColors = ["#e31a1c", "#ff7f00", "#6a3d9a", "#1f78b4", "#fb9a99", "#fdbf6f", "#cab2d6", "#b15928", "#a6cee3", "#33a02c"]
const mapStrokeOpacity = {
    default: 0.75,
    highlight: 0.95,
    click: 1
}
const mapStrokeWeight = {
    default: 5,
    highlight: 7,
    click: 8
}

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {mdAndUp} = useDisplay()
const {user} = useUser()
const {getSportIcon} = useStrava()

const googlemaps = useTemplateRef<HTMLElement>("googlemaps")
const loading = ref(true)
const loadingWeather = ref(true)
const fullscreen = ref(false)
const weatherDays = 5
const events = ref<any[]>(null)
const eventDates = ref<any[]>([])
const eventObjects = ref<Record<string, any>>({})
const selectedEvent = ref<any>(null)
const map = ref<any>(null)
const mapInfoWindow = ref<any>(null)
const mapBicyclingLayer = ref<any>(null)
const mapTrafficLayer = ref<any>(null)
const mapOptionBicycling = ref(false)
const mapOptionTraffic = ref(false)
const currentPosition = ref<any>(null)
const downloadDialog = ref(false)

const days = computed(() => (user.value.isPro ? 10 : 5))
const routeIds = computed(() => {
    if (!events.value || events.value.length == 0) return null
    return events.value.filter((e) => e.route).map((e) => e.route.idString)
})

watch(mapOptionTraffic, (newVal) => {
    mapTrafficLayer.value?.setMap(newVal ? map.value : null)
})
watch(mapOptionBicycling, (newVal) => {
    mapBicyclingLayer.value?.setMap(newVal ? map.value : null)
})

/**
 * Prepare the flat event-date list and load Google Maps.
 */
const prepareMap = () => {
    const dates = []
    events.value.forEach((e) => e.dates.forEach((d) => dates.push({date: d, event: e, weather: []})))
    eventDates.value = _.sortBy(dates, "date")

    if (import.meta.client && !window.google) {
        window.initUpcomingEventsMap = () => loadMap()

        const mapScript = document.createElement("script")
        mapScript.async = true
        mapScript.defer = true
        mapScript.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyC0cBXUmFBGn_HNlH06F2LM_WG2YWZGKe0&libraries=geometry,marker&loading=async&callback=initUpcomingEventsMap"
        mapScript.onerror = (ex) => webError("UpcomingEventsMap.mounted", ex)
        document.querySelector("head").appendChild(mapScript)
    } else {
        loadMap()
    }

    loading.value = false
}

/**
 * Fetch events from the server.
 */
const getEvents = async () => {
    if (events.value) return

    const queryCoords = currentPosition.value ? `&coordinates=${currentPosition.value.latitude},${currentPosition.value.longitude}` : ""
    const data: any[] = await api(`/api/strava/${user.value.id}/clubs/upcoming-events?days=${days.value}${queryCoords}`)
    data.forEach((e) => (e.visible = true))
    events.value = data
    setLocalStorage("clubs-upcoming-events", data, user.value.isPro ? 600 : 1800)

    prepareMap()
}

/**
 * Get the browser's current position.
 */
const getCurrentPosition = () => {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => reject(error),
            {maximumAge: 86400000, timeout: 5000, enableHighAccuracy: false}
        )
    })
}

/**
 * Load initial map data.
 */
const loadData = async () => {
    try {
        try {
            const position = await getCurrentPosition()
            mapSetPosition(position)
        } catch (error) {
            console.error(error)
        }

        const cachedEvents = getLocalStorage("clubs-upcoming-events")
        if (cachedEvents) {
            cachedEvents.forEach((e) => (e.visible = true))
            events.value = cachedEvents
            prepareMap()
        } else {
            getEvents()
        }
    } catch (ex) {
        webError("UpcomingEventsMap.mounted", ex)
    }
}

/**
 * Load and render the Google Map.
 */
const loadMap = async () => {
    try {
        if (events.value.length == 0) return

        await new Promise((r) => setTimeout(r, 100))
        if (!googlemaps.value) return

        loading.value = false

        const bikeLightStyle = new window.google.maps.StyledMapType(googleMapStyles.bikeLight, {name: "Bike Light"})

        map.value = new window.google.maps.Map(googlemaps.value, {
            mapId: "strautomator",
            gestureHandling: "greedy",
            fullscreenControl: true,
            zoom: 9,
            center: {lat: 0, lng: 0},
            mapTypeControlOptions: {
                mapTypeIds: ["roadmap", "satellite", "hybrid", "terrain", "bike_light"]
            }
        })
        map.value.mapTypes.set("bike_light", bikeLightStyle)

        fullscreenEvents.map((e) => document.addEventListener(e, onFullScreen))

        if (currentPosition.value) {
            mapSetPosition()
        }

        mapBicyclingLayer.value = new window.google.maps.BicyclingLayer()
        mapTrafficLayer.value = new window.google.maps.TrafficLayer()

        let zIndex = zIndexMax
        const routeColors = _.cloneDeep(mapRouteColors)
        const sortedEvents = _.sortBy(events.value, (e) => (e.route?.polyline ? 0 : 1))
        for (let e of sortedEvents) {
            const color = e.route?.polyline ? routeColors.shift() : routeColors.pop()

            try {
                eventObjects.value[e.id] = {zIndex: zIndex}

                if (e.route?.polyline) {
                    mapDrawRoute(e, color)
                } else if (e.route?.locationStart) {
                    e.position = {lat: e.route.locationStart[0], lng: e.route.locationStart[1]}
                }
                if (!e.position) {
                    e.position = await loadAddressLocation(e)
                }
                if (!e.position) {
                    e.noMap = true
                    e.visible = false
                    continue
                } else {
                    e.visible = true
                }

                if (!currentPosition.value) {
                    const pos = normalizePosition(e.position)
                    mapSetPosition({latitude: pos.lat, longitude: pos.lng})
                }

                mapCreateMarker(e, color)
                zIndex -= 3
            } catch (eventEx) {
                console.error("UpcomingEventsMap.loadMap.events", e.id, eventEx)
            }
        }

        mapInfoWindow.value = new window.google.maps.InfoWindow({
            content: `<div class="text-black">Loading...</div>`,
            pixelOffset: new window.google.maps.Size(0, 251)
        })
        mapInfoWindow.value.addListener("closeclick", () => {
            const evObj = eventObjects.value[selectedEvent.value.id]

            if (evObj.polyline) {
                evObj.polyline.shadow.setOptions({strokeOpacity: mapStrokeOpacity.default, strokeWeight: mapStrokeWeight.default})
                evObj.polyline.main.setOptions({strokeOpacity: mapStrokeOpacity.default, strokeWeight: mapStrokeWeight.default})
            }
            selectedEvent.value = null
        })

        loadWeather()
    } catch (ex) {
        webError("UpcomingEventsMap.loadMap", ex)
    } finally {
        loading.value = false
    }

    window.google.maps.event.trigger(map.value, "resize")
}

/**
 * Normalize a Google LatLng or literal position.
 */
const normalizePosition = (position: any) => ({lat: typeof position.lat == "function" ? position.lat() : position.lat, lng: typeof position.lng == "function" ? position.lng() : position.lng})

/**
 * Geocode an event address to map coordinates.
 */
const loadAddressLocation = async (e: any) => {
    return new Promise((resolve, reject) => {
        if (!e.address || e.address.trim() == "") resolve(null)

        const coordinates = e.address?.toString().replace("(", "").replace(")", "").replace(/ /, "").split(",")
        if (coordinates?.length == 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
            return resolve({lat: parseFloat(coordinates[0]), lng: parseFloat(coordinates[1])})
        }

        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode({address: e.address}, (results, status) => {
            if (status === "OK") {
                resolve(results[0].geometry.location)
            } else if (status === "ZERO_RESULTS") {
                resolve(null)
            } else {
                reject(status)
            }
        })
    })
}

/**
 * Fetch weather forecasts for upcoming event routes.
 */
const loadWeather = async () => {
    try {
        if (!user.value.isPro) return

        const idDateFormat = "MMDD-HHmm"
        const query = []

        for (let ed of eventDates.value) {
            ed.weather = []
            ed.weatherIcons = []

            const event = ed.event
            const route = event.route || null

            if (!route || dayjs().add(weatherDays, "days").isBefore(ed.date)) {
                continue
            }

            const eDate = dayjs(ed.date).utc()
            const timestamp = Math.round(eDate.unix())

            if (route.locationStart) {
                query.push(`${event.id}-${eDate.format(idDateFormat)}:${route.locationStart.join(",")}:${timestamp}`)
            }
            if (route.locationMid && route.totalTime >= 10800) {
                query.push(`${event.id}-${eDate.format(idDateFormat)}:${route.locationMid.join(",")}:${timestamp + Math.round(route.totalTime / 2)}`)
            }
            if (route.locationEnd && route.totalTime >= 5400) {
                query.push(`${event.id}-${eDate.format(idDateFormat)}:${route.locationEnd.join(",")}:${timestamp + route.totalTime}`)
            }
        }

        if (query.length == 0) return

        const weatherForecasts: any[] = await api(`/api/weather/${user.value.id}/multi-forecast?provider=openmeteo&data=${query.join("|")}`)

        for (let data of weatherForecasts) {
            if (!data.forecast?.temperature) continue
            try {
                const eventDate = eventDates.value.find((ed) => data.id == `${ed.event.id}-${dayjs(ed.date).utc().format(idDateFormat)}`)

                if (eventDate) {
                    eventDate.weather.push(data.forecast)

                    if (!eventDate.weatherIcons.includes(data.forecast.icon)) {
                        eventDate.weatherIcons.push(data.forecast.icon)
                    }
                    if (_.isNil(eventDate.minTemperature) || data.forecast.temperature < eventDate.minTemperature) {
                        eventDate.minTemperature = data.forecast.temperature
                    }
                    if (_.isNil(eventDate.maxTemperature) || data.forecast.temperature > eventDate.maxTemperature) {
                        eventDate.maxTemperature = data.forecast.temperature
                    }
                }
            } catch (forecastEx) {
                console.error(forecastEx)
            }
        }
    } catch (ex) {
        webError("UpcomingEventsMap.loadWeather", ex)
    } finally {
        loadingWeather.value = false
    }
}

const onFullScreen = () => {
    const doc = document as any
    fullscreen.value = doc.fullScreen || doc.mozFullScreen || doc.webkitIsFullScreen || false
}

/**
 * Create a map marker for an event.
 */
const mapCreateMarker = (e: any, color: string) => {
    try {
        const pin = new window.google.maps.marker.PinElement({
            background: color,
            glyphColor: color,
            borderColor: "#333333"
        })

        const mainMarker = new window.google.maps.marker.AdvancedMarkerElement({
            position: e.position,
            content: pin.element,
            title: e.title,
            zIndex: eventObjects.value[e.id].zIndex,
            map: map.value
        })

        mainMarker.addListener("click", () => mapMarkerClick(e))
        eventObjects.value[e.id].color = color
        eventObjects.value[e.id].marker = mainMarker
        eventObjects.value[e.id].pin = pin
    } catch (ex) {
        console.error("UpcomingEventsMap.mapCreateMarker", e.id, ex)
    }
}

/**
 * Draw an event route polyline on the map.
 */
const mapDrawRoute = (e: any, color: string) => {
    try {
        const evObj = eventObjects.value[e.id]

        const lineSymbol = {
            path: "M 0,0 5,15 -5,15 0,0 z",
            fillColor: color,
            fillOpacity: mapStrokeOpacity.default,
            strokeColor: "black",
            strokeWeight: 1,
            scale: 0.5
        }

        const points = window.google.maps.geometry.encoding.decodePath(e.route.polyline)
        const polyShadow = new window.google.maps.Polyline({
            path: points,
            strokeColor: "white",
            strokeOpacity: mapStrokeOpacity.default,
            strokeWeight: mapStrokeWeight.default + 2,
            zIndex: evObj.zIndex - 1,
            map: map.value
        })
        const polyMain = new window.google.maps.Polyline({
            path: points,
            strokeColor: color,
            strokeOpacity: mapStrokeOpacity.default,
            strokeWeight: mapStrokeWeight.default,
            zIndex: evObj.zIndex,
            icons: [
                {
                    icon: lineSymbol,
                    repeat: "80px",
                    offset: "100%"
                }
            ],
            map: map.value
        })

        e.position = points[0]

        eventObjects.value[e.id].polyline = {main: polyMain, shadow: polyShadow}
    } catch (ex) {
        console.error("UpcomingEventsMap.mapDrawRoute", e.id, ex)
    }
}

/**
 * Center the map on a position.
 */
const mapSetPosition = (position?: any) => {
    if (position) {
        currentPosition.value = position.coords || position
    }

    if (map.value && currentPosition.value) {
        map.value.setCenter(new window.google.maps.LatLng(currentPosition.value.latitude, currentPosition.value.longitude))
    }
}

/**
 * Fit the map bounds to an event route.
 */
const mapSetBounds = (e: any) => {
    if (!eventObjects.value[e.id] || !eventObjects.value[e.id].polyline || fullscreen.value) return

    const bounds = new window.google.maps.LatLngBounds()
    const points = eventObjects.value[e.id].polyline.main.getPath().getArray()
    points.forEach((p) => bounds.extend(p))
    map.value.fitBounds(bounds)
}

/**
 * Highlight or reset a route polyline.
 */
const mapHighlightRoute = (e: any, highlight: boolean, clicked?: boolean) => {
    if (!eventObjects.value[e.id] || !eventObjects.value[e.id].polyline) return

    const evObj = eventObjects.value[e.id]
    if (!e.visible) return

    let mainOptions = null
    let shadowOptions = null

    if (clicked) {
        mainOptions = {strokeOpacity: mapStrokeOpacity.click, strokeWeight: mapStrokeWeight.click, zIndex: zIndexMax}
        shadowOptions = {strokeOpacity: mapStrokeOpacity.click, strokeWeight: mapStrokeWeight.click + 2, zIndex: zIndexMax - 1}
    } else if (highlight) {
        mainOptions = {strokeOpacity: mapStrokeOpacity.highlight, strokeWeight: mapStrokeWeight.highlight, zIndex: zIndexMax - 2}
        shadowOptions = {strokeOpacity: mapStrokeOpacity.highlight, strokeWeight: mapStrokeWeight.highlight + 2, zIndex: zIndexMax - 3}
    } else if (!selectedEvent.value || selectedEvent.value.id != e.id) {
        mainOptions = {strokeOpacity: mapStrokeOpacity.default, strokeWeight: mapStrokeWeight.default, zIndex: evObj.zIndex}
        shadowOptions = {strokeOpacity: mapStrokeOpacity.default, strokeWeight: mapStrokeWeight.default + 2, zIndex: evObj.zIndex - 1}
    }

    if (mainOptions) {
        evObj.polyline.main.setOptions(mainOptions)
        evObj.polyline.shadow.setOptions(shadowOptions)
    }
}

/**
 * Handle marker clicks and open an info window.
 */
const mapMarkerClick = (e: any) => {
    if (e.noMap) {
        window.open(getEventUrl(e), "strava")
        return
    }

    if (!e.visible) {
        tableRouteToggle(e, true)
    }

    const previousEvent = selectedEvent.value || null
    const isSameClick = previousEvent?.id == e.id || false
    const evObj = eventObjects.value[e.id]
    const marker = evObj.marker

    if (isSameClick) {
        return
    }

    selectedEvent.value = e

    zIndexMax += 3
    evObj.zIndex = zIndexMax
    evObj.marker.zIndex = zIndexMax

    if (previousEvent) {
        mapHighlightRoute(previousEvent, false)
    }

    mapHighlightRoute(e, true, true)
    mapSetBounds(e)
    map.value.setCenter(marker.position)

    const evDate = eventDates.value.find((ed) => ed.event.id == e.id)
    const weather = evDate?.weather.map((w) => `${w.temperature} ${w.summary}`) || null

    let htmlWeather
    if (weather?.length > 0) {
        const htmlWeatherSingle = weather[0]
        const htmlWeatherMulti = `Start: ${weather[0]}<br />End: ${weather[weather.length - 1]}`
        htmlWeather = _.uniq(weather).length == 1 ? htmlWeatherSingle : htmlWeatherMulti
    } else {
        htmlWeather = "No weather forecast available"
    }

    mapInfoWindow.value.setContent(`
                <div class="text-black">
                <h3 class="mb-2">${e.title}</h3>
                <div>Next: ${dayjs(_.min(e.dates)).format("lll")}</div>
                <div>Distance: ${getDistance(e)}</div>
                <div>Moving time: ${getEstimatedHours(e)}</div>
                <div>Total duration: ${getEstimatedHours(e, true)}</div>
                <div class="mt-2">${htmlWeather}</div>
                <div class="mt-3 font-weight-bold"><a href="${getEventUrl(e)}" target="strava">View on Strava...</a></div>
                </div>`)

    mapInfoWindow.value.open({
        anchor: marker,
        map: map.value
    })
}

const tableRouteClick = (e: any) => mapMarkerClick(e)

/**
 * Show or hide a route on the map.
 */
const tableRouteToggle = (e: any, forceVisible?: boolean) => {
    const evObj = eventObjects.value[e.id]

    if (forceVisible) {
        e.visible = true
    } else if (!e.visible && selectedEvent.value?.id == e.id) {
        selectedEvent.value = null
        mapInfoWindow.value.close()
    }

    const baseOptions: any = e.visible ? {opacity: 1, zIndex: zIndexMax - 1, strokeOpacity: mapStrokeOpacity.default} : {opacity: 0, zIndex: 0, strokeOpacity: 0}

    evObj.polyline?.shadow.setOptions(baseOptions)

    if (baseOptions.zIndex > 0) {
        baseOptions.zIndex++
    }

    evObj.polyline?.main?.setOptions(baseOptions)
    evObj.marker.zIndex = baseOptions.zIndex

    if (e.visible) {
        evObj.pin.background = evObj.color
        evObj.pin.glyphColor = evObj.color
        evObj.pin.borderColor = "#333333"
    } else {
        evObj.pin.background = "Transparent"
        evObj.pin.glyphColor = "Transparent"
        evObj.pin.borderColor = "Transparent"
    }

    if (evObj.polyline) {
        const icons = evObj.polyline.main.get("icons")
        for (let obj of icons) {
            obj.strokeOpacity = e.visible ? 1 : 0
        }
        evObj.polyline.main.set("icons", icons)
    }
}

const getDistance = (event: any) => {
    if (!event.route?.distance) return "-"
    const distance = event.route?.distance
    const suffix = store.user.profile.units == "imperial" ? " mi" : " km"
    return `${distance}${suffix}`
}

const getEstimatedHours = (event: any, total?: boolean) => {
    if (!event.route) return "-"
    const time = total ? event.route?.totalTime : event.route?.movingTime
    const duration = dayjs.duration(time, "seconds")
    return `${duration.days() * 24 + duration.hours()}:${duration.format("mm")} h`
}

const getEventUrl = (e: any) => `https://www.strava.com/clubs/${e.club.id}/group_events/${e.id}`
const showDownloadDialog = () => (downloadDialog.value = true)
const hideDownloadDialog = () => (downloadDialog.value = false)
const downloadRoutes = () => {
    downloadDialog.value = false
    window.open(`/api/strava/${user.value.id}/${user.value.urlToken}/routes.zip?routes=${routeIds.value.join(",")}`, "gpx-download")
}

onMounted(loadData)

onBeforeUnmount(() => {
    fullscreenEvents.map((e) => document.removeEventListener(e, onFullScreen))
    if (window.initUpcomingEventsMap) {
        delete window.initUpcomingEventsMap
    }
})
</script>
