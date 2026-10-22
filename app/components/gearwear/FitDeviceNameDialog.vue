<template>
    <v-dialog v-model="visible" width="540" opacity="0.95" persistent>
        <v-card>
            <v-toolbar color="primary">
                <v-toolbar-title>{{ deviceId }}</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-toolbar-items>
                    <v-btn icon="mdi-close" @click.stop="hideDialog"></v-btn>
                </v-toolbar-items>
            </v-toolbar>
            <v-card-text>
                <v-form v-model="deviceValid" ref="deviceForm">
                    <p class="mt-3">Please enter a friendly name for this device:</p>
                    <div>
                        <v-text-field v-model="deviceNameModel" label="Device name" maxlength="50" :loading="saving" :error-messages="serverError" validate-on="blur" variant="outlined" rounded></v-text-field>
                    </div>
                </v-form>
                <div class="text-center text-md-right">
                    <v-btn color="removal" class="mb-6 mb-md-0 float-md-left" title="Forget and remove this device" @click.stop="deleteDevice" variant="text" rounded>
                        <v-icon start>mdi-delete</v-icon>
                        Forget device
                    </v-btn>
                    <v-spacer></v-spacer>
                    <v-btn color="grey" class="mr-md-2" title="Cancel and close dialog" @click.stop="hideDialog" variant="text" rounded>
                        <v-icon start>mdi-cancel</v-icon>
                        Cancel
                    </v-btn>
                    <v-btn color="primary" class="mt-md-0" title="Save device name" @click="saveDeviceName" rounded>
                        <v-icon start>mdi-check</v-icon>
                        {{ !deviceNameModel || deviceNameModel.trim().length < 1 ? "Clear name" : "Save name" }}
                    </v-btn>
                </div>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps<{
    deviceId: string
    deviceName?: string
    showDialog?: boolean
}>()

const emit = defineEmits<{
    closed: [action: string | false]
}>()

const api = useApi()
const webError = useWebError()
const store = useMainStore()
const {user} = useUser()

const deviceSaved = ref(false)
const deviceDeleted = ref(false)
const deviceValid = ref(false)
const saving = ref(false)
const serverError = ref<string[]>([])
const deviceNameModel = ref("")

const visible = computed(() => props.showDialog)

watch(
    () => props.deviceName,
    (value) => (deviceNameModel.value = value || ""),
    {immediate: true}
)

watch(
    () => props.showDialog,
    (open) => {
        if (!open) return
        deviceNameModel.value = props.deviceName || ""
        serverError.value = []
    }
)

/**
 * Hide the dialog and report the final action to the parent.
 */
const hideDialog = () => {
    emit("closed", deviceSaved.value ? "success" : deviceDeleted.value ? "removal" : false)
    deviceSaved.value = false
    deviceDeleted.value = false
}

/**
 * Save or clear the friendly name for a FIT device.
 */
const saveDeviceName = async () => {
    try {
        saving.value = true
        const deviceNames = await api(`/api/users/${user.value.id}/fit-device-names`, {method: "POST", body: {[props.deviceId]: deviceNameModel.value}})
        saving.value = false

        store.setUserData({fitDeviceNames: deviceNames})

        deviceSaved.value = true
        hideDialog()
    } catch (ex: any) {
        saving.value = false

        if (ex.data?.message || ex.response?._data?.message) {
            serverError.value = [ex.data?.message || ex.response._data.message]
        } else {
            webError("FitDeviceNameDialog.saveDeviceName", ex)
        }
    }
}

/**
 * Forget this tracked FIT device.
 */
const deleteDevice = async () => {
    try {
        saving.value = true
        await api(`/api/gearwear/${user.value.id}/battery-tracker/${props.deviceId}`, {method: "DELETE"})
        saving.value = false

        deviceDeleted.value = true
        hideDialog()
    } catch (ex: any) {
        saving.value = false

        if (ex.data?.message || ex.response?._data?.message) {
            serverError.value = [ex.data?.message || ex.response._data.message]
        } else {
            webError("FitDeviceNameDialog.deleteDevice", ex)
        }
    }
}
</script>
