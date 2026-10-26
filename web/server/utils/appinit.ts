// Strautomator Web: Initial state passed to the Nuxt app on SSR

import {paddle, recipes, strava, users, weather, StravaFitnessLevel, StravaMapStyle, StravaRideType, StravaRunType, StravaSport, StravaTrackedRecords} from "strautomator-core"
import {getRequestHeader, type RequestEvent} from "nuxt/server"
import {getGearwearByUser, getPublicUser} from "./logic"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

let staticState: any = null
let countryCurrency: Record<string, string> = null

/**
 * Static app state, computed only once.
 */
const getStaticState = () => {
    if (staticState) {
        return staticState
    }

    const weatherProviders: any[] = weather.providers.map((p) => ({value: p.name, title: p.title}))
    weatherProviders.unshift({value: null, title: "Default weather provider"})

    const rideWorkoutTypes = Object.keys(StravaRideType)
        .filter((s) => isNaN(s as any))
        .map((s) => ({title: "Ride: " + s.replace(/([A-Z])/g, " $1").trim(), value: StravaRideType[s]}))
    const runWorkoutTypes = Object.keys(StravaRunType)
        .filter((s) => isNaN(s as any))
        .map((s) => ({title: "Run: " + s.replace(/([A-Z])/g, " $1").trim(), value: StravaRunType[s]}))

    const mapStyles = Object.keys(StravaMapStyle).map((s) => {
        const baseTitle = s.replace(/([A-Z])/g, " $1").trim()
        const mapTitle = baseTitle.replace("Satellite3 D", "Satellite 3D").replace("Winter3 D", "Winter 3D")
        return {title: mapTitle, value: StravaMapStyle[s]}
    })

    const plans = JSON.parse(JSON.stringify(settings.plans))
    plans.pro.price = {
        yearly: parseFloat(paddle.prices.yearlyPrice.unitPrice.amount) / 100,
        lifetime: parseFloat(paddle.prices.lifetimePrice.unitPrice.amount) / 100
    }

    countryCurrency = {}
    for (const po of paddle.prices.yearlyPrice.unitPriceOverrides) {
        for (const c of po.countryCodes) {
            countryCurrency[c] = po.unitPrice.currencyCode
        }
    }

    staticState = {
        appTitle: settings.app.title,
        recipeProperties: recipes.propertyList,
        recipeActions: recipes.actionList,
        recipeMaxLength: settings.recipes.maxLength,
        weatherProviders: weatherProviders,
        linksOnPercent: Math.round(100 / settings.plans.free.linksOn),
        sportTypes: Object.keys(StravaSport).map((s) => StravaSport[s]),
        workoutTypes: rideWorkoutTypes.concat(runWorkoutTypes),
        recordFields: StravaTrackedRecords.slice(),
        mapStyles: mapStyles,
        freePlanDetails: plans.free,
        proPlanDetails: plans.pro,
        fitnessLevel: StravaFitnessLevel,
        ftpWeeks: settings.strava.ftp.weeks,
        archiveDownloadDays: settings.gdpr.requestDays,
        aiHumours: settings.ai.humours,
        paddle: {
            environment: settings.paddle.api.environment,
            token: settings.paddle.api.clientToken,
            priceId: {
                yearly: paddle.prices.yearlyPrice.id,
                lifetime: paddle.prices.lifetimePrice.id
            }
        }
    }

    return staticState
}

/**
 * Get the currency for the specified country.
 * @param country The country code.
 */
const getCurrency = (country: string): string => {
    return countryCurrency?.[country] || "EUR"
}

/**
 * Build the initial app state for the passed request, including the logged user data.
 * @param event The request event.
 */
export const getAppInitState = async (event: RequestEvent): Promise<any> => {
    const result: any = {...getStaticState()}
    const oauth = event.context.oauth || {}
    let country = getRequestHeader(event, "cf-ipcountry") || "US"

    result.oauth = {userId: oauth.userId || null, accessToken: oauth.accessToken || null}
    result.user = null
    result.athleteRecords = null
    result.gearwear = []

    // Logged user? Get user details, records and GearWear configs.
    if (oauth.userId && oauth.accessToken) {
        try {
            const user = await users.getById(oauth.userId)
            if (user) {
                const [publicUser, records, gearwearConfigs] = await Promise.all([getPublicUser(user, false), strava.athletes.getAthleteRecords(user), getGearwearByUser(user, false)])
                result.user = publicUser
                result.gearwear = gearwearConfigs || []

                if (records) {
                    const aRecords: any = {...records}
                    delete aRecords.id
                    delete aRecords.dateRefreshed
                    result.athleteRecords = Object.keys(aRecords).length > 0 ? aRecords : null
                }

                country = (publicUser as any)?.countryCode || country
            }
        } catch (ex) {
            logger.error("AppInit.getAppInitState", `User ${oauth.userId}`, ex)
            result.user = null
        }
    }

    result.country = country
    result.expectedCurrency = getCurrency(country)

    return result
}

declare module "nuxt/schema" {
    interface RequestEventContext {
        /** Initial app state. */
        appInit?: any
    }
}
