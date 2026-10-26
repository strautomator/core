<template>
    <div>
        <v-container fluid>
            <h1>Notifications</h1>
            <div v-if="unreadNotifications.length > 0">
                <v-alert class="mb-4" v-for="notification in unreadNotifications" :key="notification.id">
                    <div class="text-body-1 font-weight-bold text-secondary">{{ notification.title }}</div>
                    <div class="text-caption">{{ $dayjs(notification.dateCreated).format("lll") }}</div>
                    <div class="mt-2">{{ notification.body }}</div>
                </v-alert>
            </div>
            <div v-else>
                <v-alert class="mb-4" icon="mdi-bell-outline">You have no unread notifications!</v-alert>
            </div>
            <template v-if="readNotifications.length > 0">
                <v-card class="mt-6" variant="outlined">
                    <v-card-title class="bg-accent">Previous Notifications</v-card-title>
                    <v-card-text>
                        <div class="mt-4">
                            <p>These will be deleted automatically after some weeks.</p>
                            <div class="mt-4 mb-2" v-for="notification in readNotifications" :key="notification.id">
                                <v-divider class="mb-2" />
                                <div class="text-secondary">{{ notification.title }}</div>
                                <div class="text-caption">{{ $dayjs(notification.dateCreated).format("lll") }}</div>
                                <div class="mt-2">{{ notification.body }}</div>
                            </div>
                        </div>
                    </v-card-text>
                </v-card>
            </template>
            <div class="mt-4 text-center text-md-left">
                <v-btn color="primary" to="/account" title="Back to my account" exact variant="outlined" rounded size="small">
                    <v-icon start>mdi-arrow-left</v-icon>
                    Back to My Account
                </v-btn>
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import _ from "lodash"

interface NotificationItem {
    id: string
    title: string
    body: string
    read: boolean
    dateCreated: string | Date
}

useHead({title: "Notifications"})

const api = useApi()
const webError = useWebError()
const {user} = useUser()

const unreadNotifications = ref<NotificationItem[]>([])
const readNotifications = ref<NotificationItem[]>([])
let timerMarkAllRead: ReturnType<typeof setTimeout> = null

/**
 * Load all notifications and split them by read status.
 */
const loadNotifications = async () => {
    try {
        const notifications: NotificationItem[] = await api(`/api/notifications/${user.value.id}/all`)

        unreadNotifications.value = _.remove(notifications, {read: false})
        readNotifications.value = _.remove(notifications, {read: true})

        if (unreadNotifications.value.length > 0) {
            const timeout = unreadNotifications.value.length * 3000
            timerMarkAllRead = setTimeout(markAllRead, timeout)
        }
    } catch (ex) {
        unreadNotifications.value = []
        readNotifications.value = []
        webError("NotificationHistory.fetch", ex)
    }
}

/**
 * Mark all currently unread notifications as read.
 */
const markAllRead = async () => {
    const ids = _.map(unreadNotifications.value, "id")

    try {
        await api(`/api/notifications/${user.value.id}/read`, {method: "POST", body: ids})
    } catch (ex) {
        webError("NotificationHistory.markAllRead", ex)
    }
}

onMounted(loadNotifications)

onBeforeUnmount(() => {
    if (timerMarkAllRead) {
        clearTimeout(timerMarkAllRead)
        timerMarkAllRead = null
    }
})
</script>
