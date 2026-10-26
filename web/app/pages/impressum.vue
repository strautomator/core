<template>
    <div>
        <div class="stripe"></div>
        <div class="py-2"></div>

        <v-container class="text-center" fluid>
            <div class="home-wrapper">
                <h1 class="font-weight-light mt-1 mb-2" :class="mdAndUp ? 'text-h4' : 'text-h5'">Strautomator</h1>
                <h2 class="text-h3 font-weight-bold mb-4">Impressum</h2>

                <v-card color="black" class="mb-2 text-left">
                    <v-card-text>
                        <h4 class="mt-2 mb-6">Responsible according to §5 TMG</h4>
                        <p>
                            <strong>Igor Ramadas Leite Nogueira</strong><br />
                            Software Engineer<br />
                            Einzelunternehmen<br />
                            Business ID: DE454468590
                        </p>
                        <p>
                            Straße 18 16<br />
                            13089 Berlin<br />
                            Germany
                        </p>

                        <p>
                            Website: https://strautomator.com<br />
                            Email: info@strautomator.com
                        </p>

                        <div class="text-center mt-6">
                            <v-btn color="primary" @click="goBack" rounded>Back {{ backTarget }}</v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
definePageMeta({layout: "landing"})
useHead({title: "Terms and Conditions"})

const store = useMainStore()
const {mdAndUp} = useDisplay()

const backTarget = computed(() => (store.user ? "to the Dashboard" : "home"))

const goBack = () => {
    document.location.href = store.user ? "/dashboard" : "/home"
}
</script>
