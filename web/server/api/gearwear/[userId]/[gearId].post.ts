// Strautomator API: Update GearWear configuration

import {gearwear, logHelper} from "strautomator-core"
import type {GearWearConfig} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"
import _ from "lodash"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Update configuration for the specified GearWear.
 */
export default defineEventHandler(async (event) => {
    try {
        const gearId = getRouterParam(event, "gearId", {decode: true})
        const userId = getRouterParam(event, "userId", {decode: true})
        const user = await requestValidator(event)
        const body = await getBody(event)

        const max = settings.plans.free.maxGearWear
        const configs = await gearwear.getByUser(user)
        const existingConfig: GearWearConfig = _.find(configs, {id: gearId}) as GearWearConfig

        if (!user.isPro && !existingConfig && configs.length >= max) {
            return renderError(event, `${logHelper.user(user)} reached limit of ${max} GearWear on free accounts`, 400)
        }

        if (body?.disabled === false) {
            if (!existingConfig) {
                return renderError(event, `No configuration found for gear ${gearId}`, 404)
            }
            if (existingConfig.disabled) {
                await gearwear.reEnable(user, existingConfig)
            }
            return renderJson(event, {ok: true})
        }

        const bike = _.find(user.profile.bikes, {id: gearId})
        const shoe = _.find(user.profile.shoes, {id: gearId})
        if (!bike && !shoe) {
            return renderError(event, `Gear ${gearId} for user ${userId} not found`, 404)
        }

        if (!body.resetTracking) {
            const config = {
                id: gearId as string,
                userId: userId as string,
                components: body.components,
                updating: false
            }

            await gearwear.upsert(user, config)
        } else if (existingConfig) {
            const compName = body.resetTracking
            await gearwear.resetTracking(user, existingConfig, compName)
        } else {
            return renderError(event, `No configuration found for gear ${gearId}`, 404)
        }

        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
