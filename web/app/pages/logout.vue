<template>
    <div>
        <v-container fluid>
            <div class="text-center">
                <h3 class="mt-5">Goodbye!</h3>
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
useHead({title: "Logout"})

const {logout} = useAuth()

onMounted(async () => {
    try {
        await logout()
    } catch (ex) {
        document.location.href = "/home"
    }
})
</script>
