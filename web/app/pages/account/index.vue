<template>
    <div>
        <v-container fluid>
            <h1>My Account</h1>
            <v-snackbar v-if="route.query.garmin == 'linked' && user?.garmin" v-model="garminLinked" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Garmin account "{{ user.garmin.id }}" linked successfully!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-if="route.query.wahoo == 'linked' && user?.wahoo" v-model="wahooLinked" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Wahoo account "{{ user.wahoo.id }}" linked successfully!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-else-if="user && !user.wahoo" v-model="wahooUnlinked" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Wahoo account unlinked successfully!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-if="route.query.spotify == 'linked' && user?.spotify" v-model="spotifyLinked" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Spotify account "{{ user.spotify.email }}" linked successfully!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-else-if="user && !user.spotify" v-model="spotifyUnlinked" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Spotify account unlinked successfully!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-if="lastfmLinked" v-model="lastfmLinked" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Last.fm account "{{ user.lastfm.username }}" linked successfully!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-else-if="lastfmUnlinked" v-model="lastfmUnlinked" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Last.fm account unlinked successfully!
                <template #actions>
                    <v-icon @click="closeAlert">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <div>
                <div class="mt-3">
                    {{ user.profile.firstName }} {{ user.profile.lastName }}
                    <span v-if="user.preferences.privacyMode">(anonymized)</span>
                </div>
                <div class="mb-3">
                    <span class="mr-1" v-if="user.confirmEmail">{{ user.confirmEmail }} <v-icon color="secondary" size="small">mdi-alert-circle</v-icon></span>
                    <span class="mr-1" v-else-if="user.email">{{ user.email }}</span>
                    <br v-if="(user.email || user.confirmEmail) && mdAndDown" />
                    <v-btn class="ml-n1 ml-md-0" title="Set your email address" :color="user.email ? '' : 'primary'" @click="emailDialog = true" rounded size="x-small">{{
                        user.confirmEmail ? "pending confirmation" : user.email ? "change email" : "set email address"
                    }}</v-btn>
                </div>

                <div>
                    Account ID {{ user.id }}
                    <a :href="stravaProfileUrl" target="strava" title="Go to my profile on Strava..."><v-icon color="primary" class="ml-1 mt-n1" size="small">mdi-open-in-new</v-icon></a>
                </div>
                <div v-if="user.fitnessLevel">
                    Fitness level: {{ user.fitnessLevel }}/5 ({{ store.fitnessLevel[user.fitnessLevel] }})
                    <nuxt-link to="/help/faq?q=fitness level" title="Your estimated fitness from 1 (Untrained) to 5 (Elite)"><v-icon color="primary" class="ml-1 mt-n1" size="small">mdi-help-circle-outline</v-icon></nuxt-link>
                </div>
                <div>Registered on {{ dateRegistered }}</div>
                <div>Units on Strava: {{ user.profile.units }}</div>
                <div v-if="user.spotify">Spotify ID: {{ user.spotify.email }}</div>
                <div v-if="user.lastfm">Last.fm: {{ user.lastfm.username }}</div>
                <div class="ml-n1 mt-3 text-left">
                    <v-btn class="ma-1" color="primary" title="Garmin account" @click="garminDialog = true" :disabled="!user.isPro" size="small" rounded>
                        <v-icon start>mdi-triangle</v-icon>
                        {{ !user.isPro ? "Link Garmin account (PRO only)" : user.garmin ? "Unlink Garmin account" : "Link Garmin account" }}
                    </v-btn>
                    <v-btn class="ma-1" color="primary" title="Wahoo account" @click="wahooDialog = true" :disabled="!user.isPro" size="small" rounded>
                        <v-icon start>mdi-alpha-w-circle</v-icon>
                        {{ !user.isPro ? "Link Wahoo account (PRO only)" : user.wahoo ? "Unlink Wahoo account" : "Link Wahoo account" }}
                    </v-btn>
                    <v-btn class="ma-1" color="primary" title="Spotify account" @click="spotifyDialog = true" size="small" rounded>
                        <v-icon start>mdi-spotify</v-icon>
                        {{ user.spotify ? "Manage Spotify account" : "Link Spotify account" }}
                    </v-btn>
                    <v-btn class="ma-1" color="primary" title="Last.fm account" @click="showLastfmDialog" size="small" rounded>
                        <v-icon start>mdi-music</v-icon>
                        {{ user.lastfm ? "Change Last.fm account" : "Link Last.fm account" }}
                    </v-btn>
                </div>
                <v-alert class="text-body-2 mt-2 text-left" color="warning" v-if="relinkAccounts.length > 0" density="compact" variant="outlined" rounded>
                    <v-icon class="mr-1 mt-n1" color="warning" size="small">mdi-alert-outline</v-icon>
                    Your {{ relinkAccounts.join(" and ") }} authentication is about to expire, please link {{ relinkAccounts.length > 1 ? "these accounts" : "it" }} again to avoid interruptions.
                </v-alert>
            </div>
            <v-card class="mt-5" variant="outlined">
                <v-card-title class="bg-accent">My preferences</v-card-title>
                <v-card-text>
                    <h3 class="mb-2 mt-5">Weather settings</h3>
                    <div class="mt-6 d-flex" :class="{'flex-column': !mdAndUp}">
                        <div class="flex-grow-1">
                            <v-select label="Provider" v-model="weatherProvider" :items="listWeatherProviders" :class="{'mr-1': mdAndUp}" variant="outlined" rounded></v-select>
                        </div>
                        <div class="flex-grow-1">
                            <v-select label="Temperature unit" v-model="weatherUnit" :items="listWeatherUnits" :class="{'ml-1 mr-1': mdAndUp}" variant="outlined" rounded></v-select>
                        </div>
                        <div class="flex-grow-1">
                            <v-select label="Wind speed unit" v-model="windSpeedUnit" :items="listWindSpeedUnits" :class="{'ml-1 mr-1': mdAndUp}" variant="outlined" rounded></v-select>
                        </div>
                        <div class="flex-grow-1">
                            <v-select label="Language" v-model="language" :items="listLanguages" :class="{'ml-1': mdAndUp}" variant="outlined" rounded></v-select>
                        </div>
                    </div>
                    <div v-if="user.isPro" class="mt-n2 text-center text-md-left">
                        <nuxt-link title="Help me selecting a weather provider" to="/weather/select">
                            <v-icon color="primary" class="mt-n1" size="small">mdi-information-outline</v-icon>
                            Need help choosing a weather provider?
                        </nuxt-link>
                    </div>

                    <v-divider class="mt-6 mb-4" />
                    <div class="mt-n1">
                        <h3 class="mb-2">FTP auto update{{ user.isPro ? "" : " (PRO only)" }}</h3>
                        <div class="text-body-2">Strautomator can automatically update your cycling FTP and your estimated fitness level based on your recent activities.</div>
                        <v-switch class="mt-2" title="FTP auto-update" v-model="ftpAutoUpdate" :disabled="!user.isPro" :label="ftpAutoUpdate ? 'Yes, auto-update my Strava FTP' : 'No, leave my Strava FTP alone'"></v-switch>
                    </div>
                    <div class="mb-8 mt-n2 text-center text-md-left">
                        <v-btn class="ma-1" color="primary" title="Estimate my FTP" @click="showFtpDialog" variant="outlined" rounded size="small">
                            <v-icon start>mdi-flash</v-icon>
                            What's my estimated FTP?
                        </v-btn>
                    </div>

                    <v-divider class="mt-6 mb-4" />
                    <div class="mt-4">
                        <h3 class="mb-2">Delayed processing</h3>
                        <div class="text-body-2">
                            Do you want Strautomator to wait a few minutes before processing your activities? Useful if you have other services updating your Strava as well, or if you want to have some time to change details / add photos before your
                            automations are executed.
                        </div>
                        <v-switch class="mt-2" title="Delayed processing" v-model="delayedProcessing" :label="delayedProcessing ? 'Yes, delay the processing' : 'No, process activities ASAP'"></v-switch>
                        <v-alert color="accent" class="text-body-2" v-if="user.isPro && (user.garmin || user.wahoo)" density="compact">Delayed processing is recommended if you're having issues with Garmin or Wahoo automation conditions.</v-alert>
                    </div>

                    <v-divider class="mt-6 mb-4" />
                    <div class="mt-4">
                        <h3 class="mb-2">Yearly counter reset</h3>
                        <div class="text-body-2">Do you want to have your automation counters automatically reset every year?</div>
                        <v-switch class="mt-2" title="Yearly automation counter reset" v-model="resetCounter" :label="resetCounter ? 'Yes, reset counters every year' : 'No, do not reset counters'"></v-switch>
                        <v-row no-gutters>
                            <v-col cols="12" md="3" v-if="resetCounter">
                                <v-menu v-model="dateMenu" :close-on-content-click="false" transition="scale-transition" min-width="320px" location="bottom">
                                    <template #activator="{props}">
                                        <v-text-field :model-value="dateResetCounterFormatted" v-bind="props" label="Reset date" type="text" prepend-icon="mdi-calendar" variant="outlined" readonly rounded density="compact"></v-text-field>
                                    </template>
                                    <v-date-picker v-model="dateResetCounterPicker" @update:model-value="dateMenu = false" :min="minDateReset" :max="maxDateReset" hide-header></v-date-picker>
                                </v-menu>
                            </v-col>
                        </v-row>
                    </div>

                    <v-divider class="mt-6 mb-4" />
                    <div class="mt-4">
                        <h3 class="mb-2">Omit tag suffixes</h3>
                        <div class="text-body-2">Enable to hide suffixes (km/h, mph, etc) when replacing activity tags in your automations.</div>
                        <v-switch class="mt-2" title="Omit tag suffixes" v-model="noSuffixes" :label="noSuffixes ? 'Yes, omit tag suffixes' : 'Do not omit'"></v-switch>
                    </div>

                    <v-divider class="mt-6 mb-4" />
                    <div class="mt-4">
                        <h3 class="mb-2">Privacy mode</h3>
                        <div class="text-body-2">
                            Opt-in to disable the personal records tracking, anonymize your name and save as little information about processed activities as possible. Some features will be disabled.
                            <nuxt-link to="/help/faq?q=privacy mode" title="More details about the privacy mode">More details...</nuxt-link>
                        </div>
                        <v-switch
                            class="mt-2"
                            title="Privacy mode"
                            v-model="privacyMode"
                            :label="privacyMode ? 'Yes, enable the privacy mode' : 'No, I want all the features'"
                            @mousedown.stop="confirmPrivacyDialog"
                            @mouseup.stop="confirmPrivacyDialog"
                        ></v-switch>
                    </div>

                    <v-divider class="mt-6 mb-4" />
                    <div class="mt-4">
                        <h3 class="mb-2">Gear tracking preferences</h3>
                        <div class="text-body-2">
                            <template v-if="user.isPro">
                                Gear tracking is done almost instantly for the majority of processed activities, but you can still set the maximum delay you want Strautomator to wait before tracking the gear usage from your activities.
                            </template>
                            <template v-else>
                                Gear tracking is done with a default of 2 days delay, so you have plenty of time to make sure your activities are set with the correct gear. You can decrease or increase that delay, according to your use case.
                            </template>
                        </div>
                        <v-radio-group v-model="gearwearDelayDays" :inline="mdAndUp">
                            <v-radio label="1 day" :value="1"></v-radio>
                            <v-radio label="2 days" :value="2"></v-radio>
                            <v-radio label="3 days" :value="3"></v-radio>
                        </v-radio-group>
                        <template v-if="user.garmin || user.wahoo">
                            <div class="text-body-2">Do you want to be notified when a connected sensor has low battery?{{ user.isPro ? "" : " (PRO only)" }}</div>
                            <v-switch class="mt-2" title="Battery alerts" v-model="gearwearBatteryAlert" :disabled="!user.isPro" :label="gearwearBatteryAlert ? 'Yes, I want to get notified' : 'No, I don\'t want the notifications'"></v-switch>
                        </template>
                    </div>

                    <v-divider class="mt-6 mb-4" />
                    <div class="mt-4">
                        <h3 class="mb-2">Backlink preferences</h3>
                        <div class="text-body-2">
                            <span v-if="linksOn == 1">A backlink will be added to all activities processed by Strautomator.</span>
                            <span v-else-if="linksOn > 0">A backlink {{ user.isPro ? "can" : "will" }} be added to {{ 100 / linksOn }}% of the activities processed by Strautomator.</span>
                            <span v-else>A backlink won't be added to your activities.</span>
                            <v-radio-group v-model="linksOn" :inline="mdAndUp">
                                <v-radio label="100%" :value="1"></v-radio>
                                <v-radio label="50%" :value="2"></v-radio>
                                <v-radio label="20%" :value="5"></v-radio>
                                <v-radio :label="user.isPro ? 'No links' : 'No links (PRO only)'" :value="0" :disabled="!user.isPro"></v-radio>
                            </v-radio-group>
                        </div>
                    </div>

                    <div class="mt-4" v-if="linksOn > 0">
                        <h3 class="mb-2">Hashtag preference</h3>
                        <div class="text-body-2">Do you prefer using hashtags on activity names instead of an URL on activity descriptions for backlinks?</div>
                        <v-switch class="mt-2" title="Hashtag preference" v-model="activityHashtag" :label="activityHashtag ? 'Yes, hashtag on activity names' : 'No, use a link on descriptions'"></v-switch>
                    </div>

                    <v-divider class="mt-6 mb-4" />
                    <div class="mt-4">
                        <h3 class="mb-2">AI preferences{{ user.isPro ? "" : " (PRO only)" }}</h3>
                        <div class="text-body-2 mb-4">Allow Strautomator to save and process extra activity data so it can generate private AI insights.</div>
                        <v-switch class="mt-2" title="Enable AI insights (coming soon)" v-model="aiEnabled" :label="aiEnabled ? 'Yes, I want AI insights' : 'No AI insights for me'" :disabled="!user.isPro"></v-switch>
                        <div class="text-body-2 mb-4">You can select your preferred AI provider, used to generate activity names and descriptions.</div>
                        <div class="mt-6 d-flex" :class="{'flex-column': !mdAndUp}">
                            <div class="flex-grow-1">
                                <v-select label="Provider" v-model="aiProvider" :items="listAiProviders" :disabled="!user.isPro" variant="outlined" rounded></v-select>
                            </div>
                        </div>
                    </div>
                    <div class="mt-n2 text-center text-md-left">
                        <nuxt-link title="Help me selecting a weather provider" to="/activities/fortune">
                            <v-icon color="primary" class="mt-n1" size="small">mdi-information-outline</v-icon>
                            Want to test the AI features?
                        </nuxt-link>
                    </div>
                </v-card-text>
            </v-card>

            <v-card class="mt-5" variant="outlined">
                <v-card-title class="bg-accent">MCP Server{{ user.isPro ? "" : " (PRO only)" }}</v-card-title>
                <v-card-text class="pa-0">
                    <div class="pa-4">
                        <div class="text-body-2">Connect your AI clients and bots to your Strautomator account. You will be asked to sign in with Strava and authorize the client.</div>
                        <template v-if="user.isPro">
                            <div class="mt-2">
                                Server URL: <span class="font-weight-bold">{{ mcpUrl }}</span>
                            </div>
                        </template>
                        <div v-else><nuxt-link to="/billing" title="Upgrade to PRO">Upgrade to PRO</nuxt-link> to get access to our MCP server.</div>
                    </div>
                    <v-table>
                        <thead>
                            <tr>
                                <th>Client</th>
                                <th>Last Authorized</th>
                                <th class="text-right"></th>
                            </tr>
                        </thead>
                        <tbody v-if="mcpSessions.length > 0">
                            <tr v-for="session in mcpSessions" :key="session.clientId">
                                <td>{{ session.clientName }}</td>
                                <td class="text-caption">Last authorized {{ $dayjs(session.dateLastAuth).format("lll") }}</td>
                                <td class="text-right">
                                    <v-btn color="removal" title="Revoke access for this client" :loading="mcpRevoking == session.clientId" @click="revokeMcpSession(session)" variant="text" rounded size="x-small">Revoke</v-btn>
                                </td>
                            </tr>
                        </tbody>
                        <tbody v-else>
                            <tr>
                                <td colspan="3">You have no clients connected to the MCP server yet.</td>
                            </tr>
                        </tbody>
                    </v-table>
                </v-card-text>
            </v-card>

            <template v-if="!user.isPro">
                <h3 class="mt-5 mb-3">Free vs. PRO</h3>
                <free-pro-table />
            </template>
            <div class="mt-4 text-center text-md-left">
                <v-btn color="primary" to="/billing" title="PRO Subscription" rounded>
                    <v-icon start>mdi-credit-card-outline</v-icon>
                    {{ user.isPro ? "View my subscription" : "Subscribe to PRO" }}
                </v-btn>
            </div>
            <div class="mt-6 text-center text-md-left">
                <v-btn color="primary" class="mr-md-2" title="My notifications" to="/account/notifications" size="small" variant="outlined" rounded>
                    <v-icon start>mdi-bell</v-icon>
                    My notifications
                </v-btn>
                <v-btn color="primary" class="mt-3 mt-md-0 mr-md-2" title="Download my data" to="/account/download" size="small" variant="outlined" rounded>
                    <v-icon start>mdi-archive-arrow-down</v-icon>
                    Download my data
                </v-btn>
                <v-btn color="removal" class="mt-3 mt-md-0" title="Time to say goodbye?" to="/account/goodbye" size="small" variant="outlined" rounded>
                    <v-icon start>mdi-cancel</v-icon>
                    Close my account
                </v-btn>
            </div>

            <account-email-dialog :show-dialog="emailDialog" @closed="hideEmailDialog" />
            <v-snackbar v-model="emailSaved" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Please open your inbox and confirm your email address.
                <template #actions>
                    <v-icon @click="emailSaved = false">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
            <v-snackbar v-model="emailConfirmed" class="text-left" color="success" :timeout="5000" rounded location="bottom">
                Your email {{ store.user.email }} was confirmed successfully!
                <template #actions>
                    <v-icon @click="emailConfirmed = false">mdi-close-circle</v-icon>
                </template>
            </v-snackbar>
        </v-container>

        <v-dialog v-model="garminDialog" width="540" opacity="0.95">
            <v-card>
                <v-toolbar color="primary">
                    <v-toolbar-title>Garmin account</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="hideGarminDialog"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <p class="mt-4" v-if="!user.garmin">You can link your Garmin account to your Strautomator profile to use ANT+ sensor IDs and other Garmin data on your automations.</p>
                    <p class="mt-4" v-else>You have linked the Garmin account {{ user.garmin.id }} to your profile. If you unlink it, existing automations having Garmin related properties will stop working.</p>
                    <div class="text-right mt-1">
                        <v-spacer></v-spacer>
                        <v-btn class="mr-2" color="grey" title="Close" @click.stop="hideGarminDialog" variant="text" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Cancel
                        </v-btn>
                        <v-btn color="primary" title="Proceed to authentication with Garmin" @click="linkGarmin" v-if="!user.garmin" rounded>
                            <v-icon start>mdi-link</v-icon>
                            Go to Garmin
                        </v-btn>
                        <v-btn color="removal" title="Unlink my Garmin account" @click="unlinkGarmin" v-else rounded>
                            <v-icon start>mdi-link-off</v-icon>
                            Unlink
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>

        <v-dialog v-model="wahooDialog" width="540" opacity="0.95">
            <v-card>
                <v-toolbar color="primary">
                    <v-toolbar-title>Wahoo account</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="hideWahooDialog"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <p class="mt-4" v-if="!user.wahoo">You can link your Wahoo account to your Strautomator profile to use ANT+ sensor IDs paired to your device on your automations.</p>
                    <p class="mt-4" v-else>You have linked the Wahoo account {{ user.wahoo.id }} to your profile. If you unlink it, existing automations having Wahoo related properties will stop working.</p>
                    <div class="text-right mt-1">
                        <v-spacer></v-spacer>
                        <v-btn class="mr-2" color="grey" title="Close" @click.stop="hideWahooDialog" variant="text" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Cancel
                        </v-btn>
                        <v-btn color="primary" title="Proceed to authentication with Wahoo" @click="linkWahoo" v-if="!user.wahoo" rounded>
                            <v-icon start>mdi-link</v-icon>
                            Go to Wahoo
                        </v-btn>
                        <v-btn color="removal" title="Unlink my Wahoo account" @click="unlinkWahoo" v-else rounded>
                            <v-icon start>mdi-link-off</v-icon>
                            Unlink
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>

        <v-dialog v-model="spotifyDialog" width="540" opacity="0.95">
            <v-card>
                <v-toolbar color="primary">
                    <v-toolbar-title>Spotify account</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="hideSpotifyDialog"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <p class="mt-4" v-if="!user.spotify">You can link your Spotify account to your Strautomator profile to use recent tracks as part of conditions or actions in your automations.</p>
                    <p class="mt-4" v-else>You have linked the Spotify account {{ user.spotify.email }} to your profile. If you unlink it, existing automations having Spotify related properties might stop working.</p>
                    <p v-if="spotifyExpiryDate">Spotify requires you to authenticate again every few months, and your current authentication expires on {{ spotifyExpiryDate }}.</p>
                    <div class="text-right mt-1">
                        <v-spacer></v-spacer>
                        <v-btn class="mr-2" color="grey" title="Close" @click.stop="hideSpotifyDialog" variant="text" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Cancel
                        </v-btn>
                        <v-btn class="mr-2" color="removal" title="Unlink my Spotify account" @click="unlinkSpotify" v-if="user.spotify" rounded>
                            <v-icon start>mdi-link-off</v-icon>
                            Unlink
                        </v-btn>
                        <v-btn color="primary" title="Proceed to authentication with Spotify" @click="linkSpotify" rounded>
                            <v-icon start>mdi-link</v-icon>
                            {{ user.spotify ? "Reauthenticate" : "Go to Spotify" }}
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>

        <v-dialog v-model="lastfmDialog" width="540" opacity="0.95">
            <v-card>
                <v-toolbar color="primary">
                    <v-toolbar-title>Last.fm account</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="hideLastfmDialog"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <p class="mt-4" v-if="!user.lastfm">You can link your Last.fm account to your Strautomator profile to use scrobbled tracks as part of conditions or actions in your automations.</p>
                    <p class="mt-4" v-else>You have linked the Last.fm account "{{ user.lastfm.username }}" to your profile. If you unlink it, existing automations relying on Last.fm tracks might stop working.</p>
                    <v-text-field v-model="lastfmUsernameInput" label="Last.fm username" placeholder="Your last.fm username" maxlength="64" prepend-inner-icon="mdi-account-music" @keyup.enter="linkLastfm" variant="outlined" rounded></v-text-field>
                    <v-alert class="mt-n4" color="error" density="compact" rounded v-if="lastfmError">{{ lastfmError }}</v-alert>
                    <div class="text-right mt-1">
                        <v-spacer></v-spacer>
                        <v-btn class="mr-2" color="grey" title="Close" @click.stop="hideLastfmDialog" variant="text" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Cancel
                        </v-btn>
                        <v-btn class="ml-2" color="removal" title="Unlink my Last.fm account" @click="unlinkLastfm" v-if="user.lastfm" rounded>
                            <v-icon start>mdi-link-off</v-icon>
                            Unlink
                        </v-btn>
                        <v-btn color="primary" title="Save my Last.fm username" @click="linkLastfm" :disabled="!lastfmUsernameInput || lastfmUsernameInput.trim().length < 2" rounded>
                            <v-icon start>mdi-link</v-icon>
                            {{ user.lastfm ? "Update" : "Link" }}
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>

        <v-dialog v-model="ftpDialog" width="540" opacity="0.95">
            <v-card>
                <v-toolbar color="primary">
                    <v-toolbar-title>Estimate my FTP</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="hideFtpDialog"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <div class="mt-4 mb-4" v-if="ftpResult === null">
                        <v-progress-circular class="mr-1" size="16" width="2" indeterminate></v-progress-circular>
                        Estimating your FTP, please wait, this can take up to 2 minutes...
                    </div>
                    <p class="mt-4" v-else-if="ftpResult === false">Could not estimate your FTP. You need to have at least 1 recent cycling activity with power for the estimation to work.</p>
                    <template v-else>
                        <p class="mt-4 text-body-1 font-weight-bold">Estimated FTP: {{ ftpResult.recentlyUpdated ? ftpResult.ftpCurrentWatts : ftpResult.ftpWatts }} watts</p>
                        <p>
                            Estimation based on {{ ftpResult.activityCount }} activities.<br />
                            Best effort of {{ ftpResult.bestWatts }} watts:
                            <a target="StravaActivity" :href="'https://www.strava.com/activities/' + ftpResult.bestActivity.id">{{ $dayjs(ftpResult.bestActivity.dateStart).format("ll") }}</a>
                        </p>
                        <p v-if="ftpResult.ftpWatts == ftpResult.ftpCurrentWatts">Keep up the good work!</p>
                        <p v-else-if="!ftpResult.recentlyUpdated">Do you want to update your FTP from {{ ftpResult.ftpCurrentWatts || "0" }} to {{ ftpResult.ftpWatts }} watts on your Strava account now?</p>
                        <v-alert color="accent" v-else>Your FTP was recently updated by Strautomator, so you'll have to wait 24 hours before using this feature.</v-alert>
                    </template>

                    <div class="text-right mt-1">
                        <v-spacer></v-spacer>
                        <v-btn class="mr-2" color="grey" title="Close" @click.stop="hideFtpDialog" variant="text" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Close
                        </v-btn>
                        <v-btn color="primary" title="Save the estimated FTP on Strava" :disabled="!ftpResult || ftpResult.recentlyUpdated || ftpResult.ftpWatts == ftpResult.ftpCurrentWatts" @click="saveEstimatedFtp" rounded>
                            <v-icon start>mdi-cloud-upload</v-icon>
                            Update
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>

        <v-dialog v-model="privacyDialog" width="540" opacity="0.95">
            <v-card>
                <v-toolbar color="primary">
                    <v-toolbar-title>Privacy mode</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn icon="mdi-close" @click.stop="cancelPrivacyDialog"></v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <p class="mt-4">
                        If you enable the privacy mode, some of your profile data will be anonymized, your personal records won't be tracked, most of your processed activities metadata will be discarded, AI features will be disabled, and your devices
                        and sensor batteries won't be tracked.
                    </p>
                    <p>This action is irreversible! If you enable the Privacy Mode and then disable it after some days, the data previously discarded cannot be recovered.</p>

                    <div class="text-right mt-1">
                        <v-spacer></v-spacer>
                        <v-btn class="mr-2" color="grey" title="Close" @click.stop="cancelPrivacyDialog" variant="text" rounded>
                            <v-icon start>mdi-cancel</v-icon>
                            Cancel
                        </v-btn>
                        <v-btn color="primary" title="Enable the privacy mode" @click="savePrivacyDialog" rounded>
                            <v-icon start>mdi-shield-check</v-icon>
                            Confirm
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs"
import _ from "lodash"
import {onBeforeRouteLeave} from "vue-router"

useHead({title: "Account"})

const store = useMainStore()
const route = useRoute()
const api = useApi()
const webError = useWebError()
const {mdAndUp, mdAndDown} = useDisplay()
const {user, refreshUser} = useUser()

const preferences = user.value.preferences
const defaultLinksOn = user.value.isPro ? 0 : store.linksOnPercent
const initialLinksOn = preferences.linksOn || defaultLinksOn
const initialDelayedProcessing = preferences.delayedProcessing || false
const initialGearwearDelayDays = preferences.gearwearDelayDays || 2
const initialGearwearBatteryAlert = preferences.gearwearBatteryAlert || false
const initialHashtag = preferences.activityHashtag || false
const initialPrivacyMode = preferences.privacyMode || false
const initialNoSuffixes = preferences.noSuffixes || false
const initialFtpAutoUpdate = preferences.ftpAutoUpdate || false
const initialLanguage = preferences.language || "en"
const initialAiEnabled = preferences.aiEnabled || false
const initialAiProvider = preferences.aiProvider || ""
const initialWeatherProvider = user.value.isPro ? preferences.weatherProvider || null : null
const initialWeatherUnit = preferences.weatherUnit || "c"
const initialWindSpeedUnit = preferences.windSpeedUnit ? preferences.windSpeedUnit : initialWeatherUnit == "f" ? "mph" : "kph"
const initialWeatherProviders = _.cloneDeep(store.weatherProviders)

const now = dayjs()
const dateFormat = "YYYY-MM-DD"
let initialDateResetCounter: any = preferences.dateResetCounter || null
const initialResetCounter = initialDateResetCounter ? true : false
const arrDateReset = initialDateResetCounter ? initialDateResetCounter.split("-") : null

if (initialDateResetCounter) {
    initialDateResetCounter = now.month(parseInt(arrDateReset[0]) - 1).date(arrDateReset[1])
    if (initialDateResetCounter.isBefore(now)) {
        initialDateResetCounter = initialDateResetCounter.add(1, "year")
    }
} else {
    initialDateResetCounter = now.add(1, "year")
}

if (!user.value.isPro) {
    for (let wp of initialWeatherProviders) {
        if (wp.value) {
            const provider = wp as any
            provider.disabled = true
            provider.title = `${provider.title || provider.text} (PRO only)`
        }
    }
}

const savePending = ref(false)
const emailDialog = ref(false)
const emailSaved = ref(false)
const emailConfirmed = ref(false)
const garminDialog = ref(route.query.garmin == "link" && !user.value.garmin)
const garminLinked = ref(route.query.garmin == "linked")
const garminUnlinked = ref(route.query.garmin == "unlinked")
const wahooDialog = ref(route.query.wahoo == "link" && !user.value.wahoo)
const wahooLinked = ref(route.query.wahoo == "linked")
const wahooUnlinked = ref(route.query.wahoo == "unlinked")
const spotifyDialog = ref(route.query.spotify == "link")
const spotifyLinked = ref(route.query.spotify == "linked")
const spotifyUnlinked = ref(route.query.spotify == "unlinked")
const lastfmDialog = ref(route.query.lastfm == "link" && !user.value.lastfm)
const lastfmLinked = ref(false)
const lastfmUnlinked = ref(false)
const lastfmUsernameInput = ref(user.value.lastfm?.username || "")
const lastfmError = ref<string>(null)
const linksOn = ref(initialLinksOn || defaultLinksOn)
const delayedProcessing = ref(initialDelayedProcessing)
const gearwearDelayDays = ref(initialGearwearDelayDays)
const gearwearBatteryAlert = ref(initialGearwearBatteryAlert)
const activityHashtag = ref(initialHashtag)
const noSuffixes = ref(initialNoSuffixes)
const privacyMode = ref(initialPrivacyMode)
const privacyDialog = ref(false)
const ftpAutoUpdate = ref(initialFtpAutoUpdate)
const ftpResult = ref<any>(null)
const ftpDialog = ref(false)
const resetCounter = ref(initialResetCounter)
const dateResetCounter = ref(initialDateResetCounter.format(dateFormat))
const dateMenu = ref(false)
const minDateReset = dayjs().format(dateFormat)
const maxDateReset = dayjs().add(1, "year").format(dateFormat)
const language = ref(initialLanguage)
const aiEnabled = ref(initialAiEnabled)
const aiProvider = ref(initialAiProvider)
const weatherProvider = ref(initialWeatherProvider)
const weatherUnit = ref(initialWeatherUnit)
const windSpeedUnit = ref(initialWindSpeedUnit)
const listAiProviders = [
    {value: "", title: "Auto"},
    {value: "anthropic", title: "Anthropic"},
    {value: "deepseek", title: "DeepSeek"},
    {value: "gemini", title: "Gemini"},
    {value: "mistral", title: "Mistral"},
    {value: "openai", title: "OpenAI"},
    {value: "spacexai", title: "SpaceX AI"},
    {value: "zai", title: "Z.ai"}
]
const listWeatherProviders = initialWeatherProviders
const listWeatherUnits = [
    {value: "c", title: "Celsius"},
    {value: "f", title: "Fahrenheit"}
]
const listWindSpeedUnits = [
    {value: "m/s", title: "m/s"},
    {value: "kph", title: "kph"},
    {value: "mph", title: "mph"}
]
const listLanguages = [
    {value: "en", title: "English"},
    {value: "de", title: "Deutsch"},
    {value: "es", title: "Español"},
    {value: "fr", title: "Français"},
    {value: "it", title: "Italiano"},
    {value: "lt", title: "Lietuvių"},
    {value: "nl", title: "Nederlands"},
    {value: "pl", title: "Polski"},
    {value: "pt", title: "Português"},
    {value: "se", title: "Svenska"},
    {value: "sk", title: "Slovenčina"}
]
const mcpSessions = ref<any[]>([])
const mcpRevoking = ref<string>(null)

const dateRegistered = computed(() => dayjs(user.value.dateRegistered).format("ll"))
const stravaProfileUrl = computed(() => `https://www.strava.com/athletes/${user.value.id}`)
const spotifyExpiryDate = computed(() => (user.value.spotify?.dateRefreshExpiry ? dayjs(user.value.spotify.dateRefreshExpiry).format("ll") : null))
const relinkAccounts = computed(() => {
    const result = []
    if (user.value.spotify?.dateRefreshExpiry && dayjs(user.value.spotify.dateRefreshExpiry).isBefore(dayjs().add(14, "days"))) {
        result.push("Spotify")
    }
    return result
})
const dateResetCounterFormatted = computed(() => dayjs(dateResetCounter.value).format("MMM DD"))
const dateResetCounterPicker = computed({
    get: () => dayjs(dateResetCounter.value).toDate(),
    set: (value: Date) => {
        if (value) dateResetCounter.value = dayjs(value).format(dateFormat)
    }
})
const requestUrl = useRequestURL({xForwardedProto: true})
const mcpUrl = computed(() => `${requestUrl.origin}/mcp`)

const delaySavePreferences = _.debounce(() => savePreferences(), 1000)

/**
 * Mark preferences as changed and schedule saving.
 */
const preferenceChanged = (newValue: any, oldValue: any) => {
    if (newValue != oldValue) {
        savePending.value = true
        delaySavePreferences()
    }
}

watch(
    [ftpAutoUpdate, linksOn, delayedProcessing, gearwearDelayDays, gearwearBatteryAlert, activityHashtag, weatherProvider, weatherUnit, windSpeedUnit, language, noSuffixes, privacyMode, resetCounter, dateResetCounter, aiEnabled, aiProvider],
    (newValues, oldValues) => {
        if (newValues.some((value, index) => value != oldValues[index])) {
            preferenceChanged(true, false)
        }
    }
)

/**
 * Revoke an MCP client session.
 */
const revokeMcpSession = async (session: any) => {
    try {
        mcpRevoking.value = session.clientId
        await api(`/api/users/${user.value.id}/mcp/sessions/${encodeURIComponent(session.clientId)}`, {method: "DELETE"})
        mcpSessions.value = mcpSessions.value.filter((s) => s.clientId != session.clientId)
    } catch (ex) {
        webError("Account.revokeMcpSession", ex)
    } finally {
        mcpRevoking.value = null
    }
}

const hideEmailDialog = (wasEmailSaved: boolean) => {
    emailDialog.value = false
    emailSaved.value = wasEmailSaved
}
const hideGarminDialog = () => (garminDialog.value = false)
const hideWahooDialog = () => (wahooDialog.value = false)
const hideSpotifyDialog = () => (spotifyDialog.value = false)
const hideLastfmDialog = () => (lastfmDialog.value = false)
const hideFtpDialog = () => (ftpDialog.value = false)

/**
 * Navigate to Garmin authentication.
 */
const linkGarmin = async () => {
    try {
        const result: any = await api("/api/garmin/auth/url")
        document.location.href = result.url
    } catch (ex) {
        webError("Account.linkGarmin", ex)
    }
}

/**
 * Unlink the Garmin account.
 */
const unlinkGarmin = async () => {
    try {
        await api("/api/garmin/auth/unlink")
        await refreshUser()

        garminLinked.value = false
        garminUnlinked.value = true
        hideGarminDialog()
    } catch (ex) {
        webError("Account.unlinkGarmin", ex)
    }
}

/**
 * Navigate to Wahoo authentication.
 */
const linkWahoo = async () => {
    try {
        const result: any = await api("/api/wahoo/auth/url")
        document.location.href = result.url
    } catch (ex) {
        webError("Account.linkWahoo", ex)
    }
}

/**
 * Unlink the Wahoo account.
 */
const unlinkWahoo = async () => {
    try {
        await api("/api/wahoo/auth/unlink")
        await refreshUser()

        wahooLinked.value = false
        wahooUnlinked.value = true
        hideWahooDialog()
    } catch (ex) {
        webError("Account.unlinkWahoo", ex)
    }
}

/**
 * Navigate to Spotify authentication.
 */
const linkSpotify = async () => {
    try {
        const result: any = await api("/api/spotify/auth/url")
        document.location.href = result.url
    } catch (ex) {
        webError("Account.linkSpotify", ex)
    }
}

/**
 * Unlink the Spotify account.
 */
const unlinkSpotify = async () => {
    try {
        await api("/api/spotify/auth/unlink")
        await refreshUser()

        spotifyLinked.value = false
        spotifyUnlinked.value = true
        hideSpotifyDialog()
    } catch (ex) {
        webError("Account.unlinkSpotify", ex)
    }
}

const showLastfmDialog = () => {
    lastfmUsernameInput.value = user.value.lastfm?.username || ""
    lastfmDialog.value = true
}

/**
 * Link or update the Last.fm username.
 */
const linkLastfm = async () => {
    const username = (lastfmUsernameInput.value || "").trim().toLowerCase()
    if (!username || username.length < 2) return

    try {
        lastfmError.value = null

        await api("/api/lastfm/auth/link", {method: "POST", body: {username}})
        await refreshUser()

        lastfmLinked.value = true
        lastfmUnlinked.value = false
        hideLastfmDialog()
    } catch (ex: any) {
        if (ex.response?.status == 404 || ex.status == 404) {
            lastfmError.value = `User ${lastfmUsernameInput.value} not found`
        } else {
            webError("Account.linkLastfm", ex)
        }
    }
}

/**
 * Unlink the Last.fm account.
 */
const unlinkLastfm = async () => {
    try {
        await api("/api/lastfm/auth/unlink")
        await refreshUser()

        lastfmLinked.value = false
        lastfmUnlinked.value = true
        lastfmUsernameInput.value = ""
        hideLastfmDialog()
    } catch (ex) {
        webError("Account.unlinkLastfm", ex)
    }
}

const confirmPrivacyDialog = () => {
    if (!privacyMode.value) {
        privacyDialog.value = true
        return false
    }
}
const cancelPrivacyDialog = () => {
    privacyDialog.value = false
    privacyMode.value = false
}
const savePrivacyDialog = () => {
    privacyDialog.value = false
    privacyMode.value = true
}
const showFtpDialog = () => {
    ftpDialog.value = true
    estimateFtp()
}

/**
 * Estimate the user's FTP.
 */
const estimateFtp = async () => {
    if (ftpResult.value) return

    try {
        const result = await api(`/api/strava/${user.value.id}/ftp/estimate`)
        ftpResult.value = result || false
    } catch (ex) {
        webError("Account.estimateFtp", ex)
    }
}

/**
 * Save the estimated FTP on Strava.
 */
const saveEstimatedFtp = async () => {
    try {
        const result = await api(`/api/strava/${user.value.id}/ftp/estimate`, {method: "POST", body: {ftp: ftpResult.value.ftpWatts}})

        if (!result) {
            ftpResult.value.recentlyUpdated = true
        } else {
            hideFtpDialog()
        }
    } catch (ex) {
        webError("Account.saveFtp", ex)
    }
}

/**
 * Persist changed preferences to the server.
 */
const savePreferences = async () => {
    savePending.value = false

    try {
        const arrDate = dateResetCounter.value.split("-")
        arrDate.shift()

        const data = {
            ftpAutoUpdate: ftpAutoUpdate.value,
            linksOn: linksOn.value,
            delayedProcessing: delayedProcessing.value,
            gearwearDelayDays: gearwearDelayDays.value,
            gearwearBatteryAlert: gearwearBatteryAlert.value,
            activityHashtag: activityHashtag.value,
            noSuffixes: noSuffixes.value,
            privacyMode: privacyMode.value,
            weatherProvider: weatherProvider.value,
            weatherUnit: weatherUnit.value,
            windSpeedUnit: windSpeedUnit.value,
            language: language.value,
            aiEnabled: aiEnabled.value,
            aiProvider: aiProvider.value,
            dateResetCounter: resetCounter.value ? arrDate.join("-") : false
        }

        store.setUserPreferences(data)
        await api(`/api/users/${user.value.id}/preferences`, {method: "POST", body: data})
    } catch (ex) {
        webError("Account.savePreferences", ex)
    }
}

const closeAlert = () => {
    garminLinked.value = false
    garminUnlinked.value = false
    wahooLinked.value = false
    wahooUnlinked.value = false
    spotifyLinked.value = false
    spotifyUnlinked.value = false
    lastfmLinked.value = false
    lastfmUnlinked.value = false
}

/**
 * Confirm email and load MCP sessions.
 */
const loadData = async () => {
    try {
        if (route.query?.email && route.query?.token) {
            await api(`/api/users/${store.user.id}/email/confirm`, {method: "POST", body: {email: route.query.email, token: route.query.token}})
            store.setUserData({email: route.query.email, confirmEmail: null})
            emailConfirmed.value = true
        }
    } catch (ex) {
        webError("Account.fetch", ex)
    }

    if (store.user.isPro) {
        try {
            mcpSessions.value = await api(`/api/users/${store.user.id}/mcp/sessions`)
        } catch (ex) {
            webError("Account.fetchMcpSessions", ex)
        }
    }
}

onMounted(() => {
    if (route.query.spotify) {
        refreshUser()
    }
    loadData()
})

onBeforeRouteLeave(async () => {
    if (savePending.value) {
        await savePreferences()
    }
})
</script>
