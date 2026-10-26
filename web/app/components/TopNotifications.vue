<template>
    <div>
        <v-badge color="primary" offset-x="18" offset-y="18" v-if="unreadCount > 0" :content="unreadCount" bordered>
            <v-btn @click="togglePanel()" title="View my notifications" icon="mdi-bell" variant="text"></v-btn>
        </v-badge>
        <v-snackbar v-model="visible" color="accent" elevation="5" timeout="-1" :max-width="960" :width="960" min-height="68" location="top" vertical rounded>
            <template v-if="currentNotification">
                <div class="text-body-1 font-weight-bold text-secondary">{{ currentNotification.title }}</div>
                <div class="text-caption">{{ $dayjs(currentNotification.dateCreated).format("lll") }}</div>
                <div class="mt-2">
                    {{ currentNotification.body }}
                    <nuxt-link v-if="currentNotification.href" :to="currentNotification.href" title="Open notification" @click="hidePanel()"><v-icon color="secondary" size="small">mdi-open-in-new</v-icon></nuxt-link>
                </div>
            </template>
            <template #actions>
                <v-btn v-if="unreadCount < 1" color="primary" title="Close notifications" @click="hidePanel()" variant="text" rounded>
                    Close
                    <v-icon end>mdi-close</v-icon>
                </v-btn>
                <v-btn v-else color="primary" title="Go to next notification" @click="getNextUnread()" variant="text" rounded>
                    Next
                    <v-icon end>mdi-arrow-right-bold</v-icon>
                </v-btn>
            </template>
        </v-snackbar>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

interface TopNotification {
    id?: string
    title: string
    body: string
    href?: string
    read: boolean
    dateCreated: Date | string
}

const api = useApi()
const webError = useWebError()
const {user} = useUser()

const currentNotification = ref<TopNotification>(null)
const notifications = ref<TopNotification[]>([])
const unreadCount = ref(0)
const visible = ref(false)

/**
 * Add a local notification to the list.
 */
const addNotification = (title: string, body: string, href: string) => {
    notifications.value.push({title: title, body: body, href: href, read: false, dateCreated: new Date()})
    unreadCount.value++
}

/**
 * Load unread notifications, and check for automations with invalid gear.
 */
const loadNotifications = async () => {
    try {
        if (!user.value) {
            return
        }

        const bikes = _.map(user.value.profile.bikes, "id")
        const shoes = _.map(user.value.profile.shoes, "id")
        const gearIds = _.concat(bikes, shoes, ["none"])
        const recipes: any[] = Object.values(user.value.recipes)

        notifications.value = await api(`/api/notifications/${user.value.id}/unread`)
        unreadCount.value = notifications.value.length

        for (const recipe of recipes) {
            for (const action of recipe.actions) {
                if (action.type == "gear" && !gearIds.includes(action.value)) {
                    const title = `Invalid gear ${action.value}: ${action.friendlyValue}`
                    const body = `Your automation "${recipe.title}" has an invalid gear set. Please update it or delete it to avoid triggering unnecessary alerts.`
                    addNotification(title, body, `/automations/edit?id=${recipe.id}`)
                }
            }
        }
    } catch (ex) {
        webError("TopNotifications.loadNotifications", ex)
    }
}

const hidePanel = () => (visible.value = false)

const togglePanel = () => {
    if (visible.value) {
        hidePanel()
    } else {
        getNextUnread()
        visible.value = true
    }
}

/**
 * Show the next unread notification.
 */
const getNextUnread = () => {
    currentNotification.value = _.find(notifications.value, {read: false}) || null
    if (currentNotification.value) {
        markAsRead(currentNotification.value)
    }
}

/**
 * Mark the passed notification as read.
 */
const markAsRead = async (notification: TopNotification) => {
    try {
        unreadCount.value--
        notification.read = true

        if (notification.id) {
            await api(`/api/notifications/${user.value.id}/read`, {method: "POST", body: [notification.id]})
        }
    } catch (ex) {
        console.error("TopNotifications.markAsRead", `Notification ${notification.id}`, ex)
    }
}

onMounted(loadNotifications)
</script>
