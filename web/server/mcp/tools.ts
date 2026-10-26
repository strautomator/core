// Strautomator MCP tools — thin wrappers around the same handlers used by the HTTP API.

import {announcements, calendar, notifications, recipes, strava, users} from "strautomator-core"
import type {UserData} from "strautomator-core"
import {getGearwearById, getGearwearByUser, getProcessedActivities, getPublicUser, getRecipeStats, toggleGearwearComponent, upsertUserRecipe} from "../utils/logic"
import {sanitizeUser, toMcpProcessedActivity, toolError, toolResult} from "./utils"
import logger from "anyhow"

type ToolHandler = (user: UserData, args: any) => Promise<any>

interface ToolDef {
    name: string
    description: string
    inputSchema: any
    handler: ToolHandler
}

// TOOL DEFINITIONS
// --------------------------------------------------------------------------

/**
 * MCP tool catalog. Each handler delegates to server/utils/logic.ts or the equivalent core module
 * so behaviour stays aligned with the website API.
 */
const tools: ToolDef[] = [
    {
        name: "get_account",
        description:
            "Get the authenticated user's account. Includes the Strava profile (bikes and shoes), preferences and linked Garmin, Wahoo, Spotify and Last.fm accounts. Automations and FIT device names are omitted; use list_automations and list_fit_device_names for those. The user id is the Strava athlete ID.",
        inputSchema: {type: "object", properties: {}, additionalProperties: false},
        handler: async (user) => sanitizeUser(await getPublicUser(user))
    },
    {
        name: "list_processed_activities",
        description:
            "List activities Strautomator has already processed, most recently processed first. Each item has the activity id and recipes, the automations that ran, keyed by automation id. Each automation has title, conditions and actions. Activity metadata such as name, sport, distance, time, updated fields and device data is omitted. from and to filter by processing date (dateProcessed), not the activity start date. This does not fetch activities that Strautomator has not processed.",
        inputSchema: {
            type: "object",
            properties: {
                limit: {type: "number", description: "Maximum number of activities to return. Defaults to 50. Values below 1 become 1 and values above 200 are capped at 200."},
                from: {type: "string", description: "Inclusive start of the processing-date range (dateProcessed), not the activity start date. ISO 8601 or YYYY-MM-DD. Omit for no start bound."},
                to: {type: "string", description: "Inclusive end of the processing-date range (dateProcessed), not the activity start date. ISO 8601 or YYYY-MM-DD. Omit for no end bound."}
            },
            additionalProperties: false
        },
        handler: async (user, args) => {
            const activities = await getProcessedActivities(user, {...args, limit: Math.max(Math.min(parseInt(args.limit) || 50, 200), 1)}, false)
            return activities.map((activity) => toMcpProcessedActivity(activity))
        }
    },
    {
        name: "get_processed_activity",
        description:
            "Get one activity that Strautomator has already processed. Returns the activity id and recipes, the automations that ran, keyed by automation id. Each automation has title, conditions and actions. Returns null when Strautomator has no processing record for that activity. Activity metadata is omitted. Does not accept a Strava URL and does not fetch the live Strava activity.",
        inputSchema: {
            type: "object",
            properties: {activityId: {type: "string", description: "Numeric Strava activity ID, as a string. Not a URL."}},
            required: ["activityId"],
            additionalProperties: false
        },
        handler: async (user, args) => toMcpProcessedActivity(await strava.activityProcessing.getProcessedActivity(user, parseInt(args.activityId, 10)))
    },
    {
        name: "process_activity",
        description:
            "Run the user's automations on one Strava activity. Returns the processed activity, including recipes and updatedFields. Returns {processed: false} when the activity was not processed if it did not meet any automation conditions.",
        inputSchema: {
            type: "object",
            properties: {activityId: {type: "string", description: "Numeric Strava activity ID, as a string. Not a URL."}},
            required: ["activityId"],
            additionalProperties: false
        },
        handler: async (user, args) => {
            const processed = await strava.activityProcessing.processActivity(user, {id: parseInt(args.activityId, 10)})
            return processed || {processed: false}
        }
    },
    {
        name: "list_automations",
        description:
            "List the user's automations as an object keyed by automation id, or an empty object when there are none. Each automation has title, conditions and actions, plus optional op, samePropertyOp, order, defaultFor, counterProp, counterNoReset, killSwitch and disabled. Use an id from this list when updating, deleting or reading stats. Call get_automation_schema to interpret condition properties and action types.",
        inputSchema: {type: "object", properties: {}, additionalProperties: false},
        handler: async (user) => {
            const result = await getPublicUser(user)
            return result.recipes || {}
        }
    },
    {
        name: "list_fit_device_names",
        description: "List custom names the user assigned to FIT device IDs. Returns an object keyed by device ID, or an empty object when none are set. These names are separate from the account profile returned by get_account.",
        inputSchema: {type: "object", properties: {}, additionalProperties: false},
        handler: async (user) => user.fitDeviceNames || {}
    },
    {
        name: "get_automation_schema",
        description:
            "Return the condition properties and action types accepted by save_automation. properties lists activity fields, each with value, text, type, operators and optional units, min or max. actions lists action types, each with value and text. When building an automation, use property.value, an operator.value allowed for that property, and action.value. Call this before save_automation.",
        inputSchema: {type: "object", properties: {}, additionalProperties: false},
        handler: async () => ({properties: recipes.propertyList, actions: recipes.actionList})
    },
    {
        name: "save_automation",
        description:
            "Create or fully replace an automation. Omit id to create one. Set id to replace that automation entirely: fields you leave out are not preserved, so load it with list_automations first. Call get_automation_schema before choosing condition properties, operators and action types. An automation needs at least one condition, unless defaultFor is set, in which case it applies to every activity of that sport and conditions are cleared. Returns the saved automation, including its id.",
        inputSchema: {
            type: "object",
            properties: {
                id: {type: "string", description: "Existing automation id to replace. Omit to create a new automation."},
                title: {type: "string", description: "Short name shown in the automations list."},
                conditions: {
                    type: "array",
                    description: "Conditions that must match before the actions run. Required unless defaultFor is set.",
                    items: {
                        type: "object",
                        properties: {
                            property: {type: "string", description: "Activity property to test. Use a value from get_automation_schema properties."},
                            operator: {type: "string", description: "Operator allowed for that property. Typical values are any, =, !=, like, notlike, approx, > and <."},
                            value: {description: "Target value. Use a number, string or boolean matching the property type from get_automation_schema."},
                            friendlyValue: {type: "string", description: "Optional display text for the value."}
                        },
                        required: ["property", "operator", "value"],
                        additionalProperties: false
                    }
                },
                actions: {
                    type: "array",
                    description: "Actions to apply to the Strava activity when the conditions match. At least one is required.",
                    items: {
                        type: "object",
                        properties: {
                            type: {type: "string", description: "Action type. Use a value from get_automation_schema actions."},
                            value: {description: "Action payload. Required for most actions. Webhook actions must use an http or https URL. commute, trainer, generateName, generateDescription and generateInsights can omit it."},
                            friendlyValue: {type: "string", description: "Optional display text for the value."}
                        },
                        required: ["type"],
                        additionalProperties: false
                    }
                },
                op: {type: "string", enum: ["AND", "OR"], description: "How conditions on different properties are combined. Defaults to AND."},
                samePropertyOp: {type: "string", enum: ["AND", "OR"], description: "How repeated conditions on the same property are combined. Defaults to op. Kept only when there are more than 2 conditions."},
                order: {type: "number", description: "Execution order. Lower numbers run first. Forced to 0 when defaultFor is set."},
                defaultFor: {type: "string", description: "Strava sport type, such as Ride, GravelRide, Run, TrailRun or Swim. The automation then applies to every activity of that sport and must not include conditions."},
                killSwitch: {type: "boolean", description: "When true, later automations are skipped after this one executes."},
                disabled: {type: "boolean", description: "When true, the automation is saved but not executed."},
                counterProp: {type: "string", description: "Activity property added to this automation's counter on each run. Omit to increment the counter by 1."},
                counterNoReset: {type: "boolean", description: "When true, the counter is not reset at the start of each year."}
            },
            required: ["title", "actions"],
            additionalProperties: false
        },
        handler: async (user, args) => {
            const fresh = await users.getById(user.id)
            return upsertUserRecipe(fresh, args, "POST")
        }
    },
    {
        name: "delete_automation",
        description: "Permanently delete one automation by id. Returns the deleted automation. Fails when the id does not exist. Use list_automations to find ids.",
        inputSchema: {
            type: "object",
            properties: {id: {type: "string", description: "Automation id to delete."}},
            required: ["id"],
            additionalProperties: false
        },
        handler: async (user, args) => {
            const fresh = await users.getById(user.id)
            return upsertUserRecipe(fresh, null, "DELETE", args.id.toString())
        }
    },
    {
        name: "get_automation_stats",
        description:
            "Get execution stats for the user's automations. Omit id for every automation: each entry includes activityCount, counter, recentFailures, dateLastTrigger and dateLastFailure, and the activity id list is omitted. Set id for one automation, which also includes activities, the Strava activity IDs that triggered it. Fails when that id does not exist.",
        inputSchema: {
            type: "object",
            properties: {id: {type: "string", description: "Automation id from list_automations. Omit to return stats for every automation."}},
            additionalProperties: false
        },
        handler: async (user, args) => getRecipeStats(user, args.id)
    },
    {
        name: "list_gearwear",
        description:
            "List the user's GearWear / Gear configurations and, for a PRO user with Garmin or Wahoo linked, device battery tracking. Returns {configs, batteryTracker}. Each config has id (the Strava gear ID), name, components and optional disabled. A disabled config is not updated by new activities. Each component has name, disabled, currentDistance, alertDistance, currentTime and alertTime in seconds, activityCount and optional preAlertPercent. Distances use the user's km or miles unit. Disabled components are listed last and are not tracked. batteryTracker.devices use status full, good, ok, low, critical or unknown. Use a config id and component name with toggle_gearwear_component.",
        inputSchema: {type: "object", properties: {}, additionalProperties: false},
        handler: async (user) => getGearwearByUser(user)
    },
    {
        name: "get_gearwear",
        description:
            "Get one GearWear / Gear configuration and the matching Strava gear. Returns {config, gear}. config is null when that gear has no GearWear configuration yet. gear includes the Strava id, name, brand, model and total distance in the user's units. Component distances use the user's km or miles unit, and component times are in seconds. Bike gear IDs start with b and shoe gear IDs start with g.",
        inputSchema: {
            type: "object",
            properties: {gearId: {type: "string", description: "Strava gear ID. Bike IDs start with b and shoe IDs start with g. Use list_gearwear or the bikes and shoes on get_account to find one."}},
            required: ["gearId"],
            additionalProperties: false
        },
        handler: async (user, args) => getGearwearById(user, args.gearId.toString())
    },
    {
        name: "toggle_gearwear_component",
        description:
            "Enable or disable one existing GearWear / Gear component. Set enabled to true to resume tracking, or false to stop tracking it. This does not create a component, reset its distance or time, or re-enable a disabled GearWear configuration. The name must match the component name exactly (case sensitive). Returns the GearWear configuration. Call list_gearwear or get_gearwear first to get the GearWear configuration details.",
        inputSchema: {
            type: "object",
            properties: {
                gearId: {type: "string", description: "Strava gear ID of the GearWear configuration. Bike IDs start with b and shoe IDs start with g."},
                name: {type: "string", description: "Exact component name from that GearWear configuration."},
                enabled: {type: "boolean", description: "True to enable tracking for the component. False to disable it."}
            },
            required: ["gearId", "name", "enabled"],
            additionalProperties: false
        },
        handler: async (user, args) => toggleGearwearComponent(user, args.gearId?.toString(), args.name?.toString(), args.enabled)
    },
    {
        name: "list_calendars",
        description:
            "List metadata for the calendars Strautomator has generated for the user. Returns calendar id, the options used to build it, activityCount, clubEventCount, gearEventCount, and dateCreated, dateUpdated and dateExpiry. Does not return the ICS feed or the events.",
        inputSchema: {type: "object", properties: {}, additionalProperties: false},
        handler: async (user) => calendar.getByUser(user)
    },
    {
        name: "list_notifications",
        description:
            "List Strautomator notifications for the user. By default returns only unread notifications that have not expired. Each notification has id, title, body, read, dateCreated and optional href and dateExpiry. A failed automation adds recipeId and activityId. A GearWear alert adds gearId and component. An account alert adds auth and source (strava, garmin, wahoo or spotify).",
        inputSchema: {
            type: "object",
            properties: {includeRead: {type: "boolean", description: "When true, also include notifications that are already read or expired. Defaults to false."}},
            additionalProperties: false
        },
        handler: async (user, args) => notifications.getByUser(user, args.includeRead === true)
    },
    {
        name: "list_announcements",
        description:
            "List Strautomator announcements currently targeted at this user, such as new features and service updates. Each announcement has id, title, body, dateStart, dateExpiry and optional href, newFeature and affiliate. The read count is omitted.",
        inputSchema: {type: "object", properties: {}, additionalProperties: false},
        handler: async (user) => (await announcements.getActive(user)).map(({readCount, ...announcement}) => announcement)
    }
]

// EXPORTS
// --------------------------------------------------------------------------

/**
 * Return the MCP tool list (name, description and JSON Schema) for tools/list.
 */
export const listTools = () => {
    return tools.map((t) => ({name: t.name, description: t.description, inputSchema: t.inputSchema}))
}

/**
 * Execute a tool by name for the authenticated user.
 */
export const callTool = async (user: UserData, name: string, args: any) => {
    const tool = tools.find((t) => t.name == name)
    if (!tool) {
        return toolError(`Unknown tool: ${name}`)
    }

    try {
        const result = await tool.handler(user, args || {})
        return toolResult(result)
    } catch (ex) {
        logger.error("MCP.callTool", user.id, name, ex)
        return toolError(ex.message || ex.toString())
    }
}
