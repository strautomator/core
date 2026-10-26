<template>
    <v-dialog v-model="visible" width="440" opacity="0.95" persistent>
        <v-card>
            <v-toolbar color="primary">
                <v-toolbar-title>Change email address</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-toolbar-items>
                    <v-btn icon="mdi-close" @click.stop="hideDialog"></v-btn>
                </v-toolbar-items>
            </v-toolbar>
            <v-card-text>
                <v-form v-model="emailValid" ref="emailForm">
                    <p class="mt-3">
                        Please enter your email address below.<br />
                        You'll get a message with a link to confirm it.
                    </p>
                    <div>
                        <v-text-field v-model="userEmail" label="Email" placeholder="@" maxlength="150" :loading="saving" :rules="inputRules" :error-messages="serverError" validate-on="blur" variant="outlined" rounded></v-text-field>
                    </div>
                </v-form>
                <div class="text-right">
                    <v-spacer></v-spacer>
                    <v-btn class="mr-2" color="grey" title="Close dialog" @click.stop="hideDialog" variant="text" rounded>
                        <v-icon start>mdi-cancel</v-icon>
                        Cancel
                    </v-btn>
                    <v-btn color="primary" title="Save email address" :disabled="userEmail.length < 6" @click="saveEmail" rounded>
                        <v-icon start>mdi-check</v-icon>
                        Save email
                    </v-btn>
                </div>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps<{showDialog: boolean}>()
const emit = defineEmits<{closed: [emailSaved: boolean]}>()

const store = useMainStore()
const api = useApi()
const webError = useWebError()
const {user} = useUser()

const emailForm = useTemplateRef<any>("emailForm")
const userEmail = ref(store.user?.email || "")
const emailValid = ref(false)
const emailSaved = ref(false)
const saving = ref(false)
const serverError = ref<string[]>([])

const inputRules = computed(() => {
    const rules = {
        required: (value: string) => !!value || "Email is required",
        email: (value: string) => {
            const pattern = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            return pattern.test(value) || "Invalid email address"
        }
    }

    return [rules.required, rules.email]
})

/**
 * Hide the dialog and tell the parent if the email was saved.
 */
const hideDialog = () => {
    emit("closed", emailSaved.value)
    emailSaved.value = false
}

const visible = computed({
    get: () => props.showDialog,
    set: (value: boolean) => {
        if (!value) hideDialog()
    }
})

/**
 * Save the user's email address and request confirmation.
 */
const saveEmail = async () => {
    try {
        const validation = await emailForm.value?.validate()
        if (validation?.valid === false) return

        if (userEmail.value != store.user?.email) {
            saving.value = true
            await api(`/api/users/${user.value.id}/email`, {method: "POST", body: {email: userEmail.value}})
            saving.value = false

            store.setUserData({email: userEmail.value})
            emailSaved.value = true
        }

        hideDialog()
    } catch (ex: any) {
        saving.value = false

        if (ex.data?.message || ex.response?._data?.message || ex.response?.data?.message) {
            serverError.value = [ex.data?.message || ex.response?._data?.message || ex.response?.data?.message]
        } else {
            webError("EmailDialog.saveEmail", ex)
        }
    }
}
</script>
