<template>
    <v-card variant="outlined">
        <v-card-text class="pa-0">
            <v-table>
                <thead class="bg-accent">
                    <tr>
                        <th>Features</th>
                        <th class="text-center">FREE</th>
                        <th class="text-center">PRO</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Automations</td>
                        <td class="text-center">{{ store.freePlanDetails.maxRecipes }}</td>
                        <td class="text-center">Unlimited</td>
                    </tr>
                    <tr>
                        <td>GearWear</td>
                        <td class="text-center">{{ store.freePlanDetails.maxGearWear }}</td>
                        <td class="text-center">Unlimited</td>
                    </tr>
                    <tr>
                        <td>Weather providers</td>
                        <td class="text-center">1</td>
                        <td class="text-center">5</td>
                    </tr>
                    <tr>
                        <td>Personal records</td>
                        <td class="text-center">Bike, Run</td>
                        <td class="text-center">All sports</td>
                    </tr>
                    <tr>
                        <td>Batch processing</td>
                        <td class="text-center">{{ store.freePlanDetails.batchDays }} days</td>
                        <td class="text-center">{{ store.proPlanDetails.batchDays }} days</td>
                    </tr>
                    <tr>
                        <td>Calendar range</td>
                        <td class="text-center">
                            -{{ store.freePlanDetails.pastCalendarDays }}{{ dayText }}<br />
                            +{{ store.freePlanDetails.futureCalendarDays }}{{ dayText }}
                        </td>
                        <td class="text-center">
                            -{{ store.proPlanDetails.pastCalendarDays }}{{ dayText }}<br />
                            +{{ store.proPlanDetails.futureCalendarDays }}{{ dayText }}
                        </td>
                    </tr>
                    <tr>
                        <td>Calendar customization</td>
                        <td class="text-center">Limited</td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>AI integration</td>
                        <td class="text-center">Limited</td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>MCP server</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>Shared automations</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>FTP auto update</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>Export to FIT</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>Garmin sensors</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>Wahoo sensors</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>Spotify lyrics</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>Webhooks</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>No backlinks</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td>No website ads</td>
                        <td class="text-center"><v-icon>mdi-checkbox-blank-circle-outline</v-icon></td>
                        <td class="text-center"><v-icon>mdi-checkbox-marked-circle-outline</v-icon></td>
                    </tr>
                    <tr>
                        <td colspan="3">PRO costs {{ currencySymbol }}{{ store.proPlanDetails.price.yearly.toFixed(2) }} / year or {{ currencySymbol }}{{ store.proPlanDetails.price.lifetime.toFixed(2) }} / lifetime</td>
                    </tr>
                </tbody>
            </v-table>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
const store = useMainStore()
const {mdAndUp} = useDisplay()
const {currencySymbol} = useSubscription()

const dayText = computed(() => (mdAndUp.value ? " days" : "d"))
</script>
