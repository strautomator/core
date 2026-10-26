// Strautomator Web: Main app store

import {defineStore} from "pinia"

/**
 * Main app state, initially populated from the server (see plugins/01.init.server.ts).
 */
export interface MainState {
    lastUserFetch: number
    errorTitle: string
    errorMessage: string
    errorMethod: string
    oauth: {userId: string; accessToken: string}
    appTitle: string
    user: any
    athleteRecords: any
    recipeProperties: any[]
    recipeActions: any[]
    recipeMaxLength: Record<string, number>
    weatherProviders: {title: string; value: string}[]
    linksOnPercent: number
    ftpWeeks: number
    gearwear: any[]
    sportTypes: string[]
    workoutTypes: {title: string; value: number}[]
    recordFields: string[]
    mapStyles: {title: string; value: string}[]
    freePlanDetails: any
    proPlanDetails: any
    fitnessLevel: any
    country: string
    expectedCurrency: string
    archiveDownloadDays: number
    aiHumours: string[]
    paddle: {environment: string; token: string; priceId: {yearly: string; lifetime: string}}
}

/**
 * Normalize the recipe logical operators on the passed user.
 * @param user The user data.
 */
const normalizeUserRecipes = (user: any): void => {
    if (!user?.recipes) {
        return
    }

    for (const recipe of Object.values(user.recipes) as any[]) {
        if (!recipe.op) recipe.op = "AND"
        if (!recipe.samePropertyOp) recipe.samePropertyOp = recipe.op
    }
}

export const useMainStore = defineStore("main", {
    state: (): MainState => ({
        lastUserFetch: new Date().valueOf(),
        errorTitle: null,
        errorMessage: null,
        errorMethod: null,
        oauth: {userId: null, accessToken: null},
        appTitle: "Strautomator",
        user: null,
        athleteRecords: null,
        recipeProperties: [],
        recipeActions: [],
        recipeMaxLength: null,
        weatherProviders: [],
        linksOnPercent: null,
        ftpWeeks: null,
        gearwear: [],
        sportTypes: [],
        workoutTypes: [],
        recordFields: [],
        mapStyles: [],
        freePlanDetails: {},
        proPlanDetails: {},
        fitnessLevel: {},
        country: null,
        expectedCurrency: null,
        archiveDownloadDays: null,
        aiHumours: [],
        paddle: null
    }),
    getters: {
        isLoggedIn: (state): boolean => !!(state.oauth?.accessToken && state.user),
        hasError: (state): boolean => !!(state.errorTitle || state.errorMessage)
    },
    actions: {
        /**
         * Populate the store with the initial state sent by the server.
         * @param data Initial app state.
         */
        init(data: Partial<MainState>) {
            if (!data) return
            normalizeUserRecipes(data.user)
            this.$patch(data)
        },
        /**
         * Set (or clear) the current error details.
         * @param data Error title, message and method, or null to clear.
         */
        setError(data: {title: string; message: string; method: string}) {
            this.errorTitle = data?.title || null
            this.errorMessage = data?.message || null
            this.errorMethod = data?.method || null
        },
        /**
         * Replace the current user.
         * @param data User data.
         */
        setUser(data: any) {
            normalizeUserRecipes(data)
            this.user = data
        },
        /**
         * Update specific fields of the current user.
         * @param data Partial user data.
         */
        setUserData(data: any) {
            Object.assign(this.user, data)
        },
        /**
         * Update the current user preferences.
         * @param data Partial preferences.
         */
        setUserPreferences(data: any) {
            if (!this.user.preferences) this.user.preferences = {}
            Object.assign(this.user.preferences, data)
        },
        /**
         * Update the current user's calendar template.
         * @param data Partial calendar template.
         */
        setUserCalendarTemplate(data: any) {
            if (!this.user.preferences) this.user.preferences = {}
            if (!this.user.preferences.calendarTemplate) this.user.preferences.calendarTemplate = {}
            Object.assign(this.user.preferences.calendarTemplate, data)
        },
        /**
         * Add or replace a recipe of the current user.
         * @param recipe The recipe.
         */
        setUserRecipe(recipe: any) {
            this.user.recipes[recipe.id] = recipe
        },
        /**
         * Delete a recipe from the current user.
         * @param recipe The recipe.
         */
        deleteUserRecipe(recipe: any) {
            delete this.user.recipes[recipe.id]
        },
        /**
         * Set the GearWear configurations.
         * @param data List of GearWear configs.
         */
        setGearWear(data: any[]) {
            this.gearwear = data
        },
        /**
         * Set the athlete records.
         * @param data Athlete records.
         */
        setAthleteRecords(data: any) {
            if (data) {
                delete data.id
                delete data.dateRefreshed
            }
            this.athleteRecords = data
        },
        /**
         * Set the timestamp of the last user fetch.
         * @param timestamp Timestamp in milliseconds.
         */
        setLastUserFetch(timestamp: number) {
            this.lastUserFetch = timestamp
        }
    }
})
