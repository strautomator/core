// Strautomator API: Process an activity sent by the Strava webhook

import {events, strava, users} from "strautomator-core"
import {defineEventHandler, getQuery, getRequestHeader} from "nuxt/server"
import {renderError, renderJson, getRequiredParam, validateUrlToken} from "../../../../../utils/web"
import dayjs from "../../../../../utils/dayjs"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Process an activity sent by the Strava webhook.
 */
export default defineEventHandler(async (event) => {
    try {
        validateUrlToken(event, settings.strava.api.urlToken)
        if (!(getRequestHeader(event, "user-agent") as string)?.includes(settings.app.title)) throw new Error("Unauthorized client")

        const query = getQuery(event)
        const userId = getRequiredParam(event, "userId", "Missing request params")
        const user = await users.getById(userId)

        if (!user) {
            await users.ignore(userId)
            return renderError(event, "User not found", 404)
        } else if (!user.stravaTokens || (!user.stravaTokens.accessToken && !user.stravaTokens.refreshToken)) {
            return renderError(event, "User has no access tokens", 400)
        } else if (user.suspended) {
            return renderJson(event, {message: "User is suspended"})
        }

        const now = dayjs.utc().toDate()
        const action = query.action as string
        const activityId = parseInt(getRequiredParam(event, "activityId") as string)

        if (action == "create") {
            if (user.preferences.delayedProcessing) {
                await strava.activityProcessing.queueActivity(user, activityId)
                user.dateLastProcessedActivity = now
            } else {
                const processed = await strava.activityProcessing.processActivity(user, {id: activityId})
                if (processed && !processed.error) {
                    user.dateLastProcessedActivity = now
                }
            }
            events.emit("Strava.activityCreated", user, activityId)
        } else if (action == "update") {
            events.emit("Strava.activityUpdated", user, activityId)
        } else if (action == "delete") {
            events.emit("Strava.activityDeleted", user, activityId)
        }

        user.dateLastActivity = now
        const updatedUser = {id: user.id, displayName: user.displayName, dateLastActivity: user.dateLastActivity, dateLastProcessedActivity: user.dateLastProcessedActivity}
        await users.update(updatedUser)

        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
