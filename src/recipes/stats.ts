// Strautomator Core: Recipe Stats

import {RecipeData, RecipeStatsData} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import logger = require("anyhow")
import dayjs from "../dayjs"

/**
 * Recipe stats methods.
 */
export class RecipeStats {
    private constructor() {}
    private static _instance: RecipeStats
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Get stats for the specified recipe, or all recipes if no recipe is passed.
     * @param user The user owner of the recipe(s).
     * @param recipe Optional recipe to be fetched.
     */
    getStats = async (user: UserData, recipe?: RecipeData): Promise<RecipeStatsData | RecipeStatsData[]> => {
        try {
            if (recipe) {
                const id = `${user.id}-${recipe.id}`
                const stats: RecipeStatsData = await database.get("recipe-stats", id)

                // No stats for the specified recipe? Return null.
                if (!stats) {
                    logger.info("RecipeStats.getStats", `User ${user.id} ${user.displayName}`, `No stats for recipe ${recipe.id}`)
                    return null
                }

                // Set activity count.
                stats.activityCount = stats.activities ? stats.activities.length : 0

                // Make sure custom counter is set.
                if (!stats.counter) {
                    stats.counter = 0
                }

                const lastTrigger = dayjs(stats.dateLastTrigger).format("lll")
                logger.debug("RecipeStats.getStats", `User ${user.id} ${user.displayName}`, `Recipe ${recipe.id}`, `${stats.activityCount} activities`, `Last triggered: ${lastTrigger}`)
                return stats
            } else {
                const arrStats: RecipeStatsData[] = await database.search("recipe-stats", ["userId", "==", user.id])

                // No recipe stats found at all for the user? Stop here.
                // Otherwise set the activity count for each recipe stats.
                if (arrStats.length == 0) {
                    logger.info("RecipeStats.getStats", `User ${user.id} ${user.displayName}`, "No recipe stats found")
                    return []
                } else {
                    arrStats.forEach((s) => (s.activityCount = s.activities ? s.activities.length : 0))
                }

                logger.info("RecipeStats.getStats", `User ${user.id} ${user.displayName}`, `${arrStats.length} recipe stats found`)
                return arrStats
            }
        } catch (ex) {
            const recipeLog = recipe ? `Recipe ${recipe.id}` : `All recipes`
            logger.error("RecipeStats.getStats", `User ${user.id} ${user.displayName}`, recipeLog, ex)
            throw ex
        }
    }

    /**
     * Increment a recipe's trigger count and date.
     * @param user The user to have activity count incremented.
     * @param recipe The recipe to be updated.
     * @param activity The activity that triggered the recipe.
     */
    updateStats = async (user: UserData, recipe: RecipeData, activity: StravaActivity): Promise<void> => {
        const id = `${user.id}-${recipe.id}`

        try {
            const now = dayjs.utc().toDate()

            // Check if a stats document already exists.
            const doc = database.doc("recipe-stats", id)
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists
            let stats: RecipeStatsData

            // If not existing, create a new stats object.
            if (!exists) {
                stats = {
                    id: id,
                    userId: user.id,
                    activities: [activity.id],
                    dateLastTrigger: now,
                    counter: 1
                }

                logger.info("RecipeStats.updateStats", id, "Created new recipe stats")
            } else {
                stats = docSnapshot.data() as RecipeStatsData

                if (stats.activities.indexOf(activity.id) < 0) {
                    stats.activities.push(activity.id)
                }

                // Make sure stats has a counter.
                if (!stats.counter) {
                    stats.counter = 0
                }

                stats.dateLastTrigger = now
                stats.counter++
            }

            // Save stats to the database.
            await database.merge("recipe-stats", stats, doc)
            logger.info("RecipeStats.updateStats", id, `Added activity ${activity.id}`)
        } catch (ex) {
            logger.error("RecipeStats.updateStats", id, `Activity ${activity.id}`, ex)
        }
    }

    /**
     * Manually set the recipe stats counter.
     * @param user The user to have activity count incremented.
     * @param recipe The recipe to be updated.
     * @param counter The desired numeric counter.
     */
    setCounter = async (user: UserData, recipe: RecipeData, counter: number): Promise<void> => {
        const id = `${user.id}-${recipe.id}`

        try {
            const doc = database.doc("recipe-stats", id)
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists
            let stats: RecipeStatsData

            // If not existing, create a new stats object, otherwise simply update the counter.
            if (!exists) {
                stats = {
                    id: id,
                    userId: user.id,
                    activities: [],
                    dateLastTrigger: null,
                    counter: counter
                }

                logger.info("RecipeStats.setCounter", id, `Created new recipe stats`)
            } else {
                stats = docSnapshot.data() as RecipeStatsData
                stats.counter = counter
            }

            // Update the counter on the database.
            await database.merge("recipe-stats", stats, doc)
            logger.info("RecipeStats.setCounter", id, `Counter ${counter}`)
        } catch (ex) {
            logger.error("RecipeStats.setCounter", id, `Counter ${counter}`, ex)
        }
    }
}

// Exports...
export default RecipeStats.Instance
