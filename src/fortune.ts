// Strautomator Core: Strava Fortune

import {StravaActivity, StravaSport} from "./strava/types"
import {UserData} from "./users/types"
import weather from "./weather"
import dayjs from "./dayjs"
import _ = require("lodash")
import logger = require("anyhow")

/**
 * Random funny quotes.
 */
export const fortuneCookies: string[] = [
    "Sometimes when I close my eyes, I can't see.",
    "He who laughs last didn't get it.",
    "I put my phone in airplane mode, but it's not flying!",
    "I'm not lazy, I'm just very relaxed.",
    "Roses are red, my name is not Dave, this makes no sense, microwave.",
    "Yesterday I did nothing and today I'm finishing what I did yesterday.",
    "Doing nothing is hard, you never know when you're done.",
    "If I’m not back in five minutes, just wait longer.",
    "Why do they call it rush hour when nothing moves?",
    "Get your facts first, then you can distort them as you please.",
    "What's another word for Thesaurus?",
    "I can resist everything except temptation.",
    "Weather forecast for tonight: dark.",
    "Cure for an obsession: get another one.",
    "One advantage of talking to yourself is that you know at least somebody's listening.",
    "It never gets easier, you just go faster.",
    "Beyond pain there is a whole universe of more pain.",
    "You never have the wind with you - either it's against you or you’re having a good day.",
    "It is the unknown around the corner that turns my wheels.",
    "I’d like to help you out. Which way did you come in?",
    "I doubt, therefore I might be.",
    "Constipated people don’t give a crap.",
    "All generalizations are false.",
    "Hello world!",
    "I tried to set my password to 'beef stew' but it wasn't stroganoff."
]

/**
 * Gets a random activity name. Kind of a fortune cookie, but not really.
 * @param user The user.
 * @param activity The Strava activity.
 */
export const getActivityFortune = async (user: UserData, activity: StravaActivity): Promise<string> => {
    const now = dayjs.utc()
    const imperial = user.profile.units == "imperial"

    let prefixes = ["", "delightful", "amazing", "great", "", "just your regular", "crazy", "superb", "", "magnificent", "marvellous", "exotic", ""]
    let names = []
    let uniqueNames = []
    let seqCount = 0
    let usingWeather = false

    // Activity types.
    const isRide = activity.type == StravaSport.Ride || activity.type == StravaSport.VirtualRide || activity.type == StravaSport.EBikeRide
    const isRun = activity.type == StravaSport.Run || activity.type == StravaSport.Walk

    // Rounded activity properties.
    const distanceR = Math.round(activity.distance)
    const speedAvgR = Math.round(activity.speedAvg)
    const elevationGainR = Math.round(activity.elevationGain)

    // Virtual ride prefix.
    if (activity.type == StravaSport.VirtualRide) {
        prefixes.push("virtual:")
        prefixes.unshift("virtual:")
    }
    if (activity.trainer) {
        prefixes.push("pain cave:")
        prefixes.push("turbo trainer:")
        prefixes.unshift("indoor:")
    }

    // Cycling.
    if (isRide) {
        if (activity.distance >= 400) {
            uniqueNames.push("almost a lap around the world")
            uniqueNames.push("short and easy tour")
        } else if (activity.distance >= 200 && activity.distance <= 250) {
            names.push("double century tour")
            names.push("double century ride")
            names.push("century x2")
        } else if (activity.distance >= 100 && activity.distance <= 120) {
            names.push("century ride")
            names.push("century tour")
        } else if (activity.distance > 98 && activity.distance < 100) {
            names.push("almost-a-century ride")
            names.push("and so close to 3 digits")
        } else if ((imperial && distanceR == 26) || distanceR == 42) {
            uniqueNames.push("marathon on two wheels")
            uniqueNames.push("marathon on a bike")
        } else if (((imperial && activity.distance < 6) || activity.distance) < 10 && activity.distance > 0) {
            names.push("and short, too short of a ride")
            names.push("short, very short ride")
            names.push("mini ride")
        }

        if ((imperial && activity.speedAvg > 26) || activity.speedAvg > 42) {
            uniqueNames.push("fast and furious")
            uniqueNames.push("shut up legs")
            uniqueNames.push("lightspeed")
            uniqueNames.push("push push push")
        } else if (((imperial && activity.speedAvg < 5) || activity.speedAvg < 8) && activity.speedAvg > 0) {
            uniqueNames.push("slow does it")
            uniqueNames.push("who's in a hurry?")
        }

        if (activity.wattsMax > 1600 || activity.wattsAvg > 400) {
            uniqueNames.push("rocket propelled")
            uniqueNames.push("shut up legs")
            uniqueNames.push("legs are pumping hard")
        } else if (activity.wattsAvg < 80 && activity.wattsAvg > 0) {
            uniqueNames.push("easy does it")
            uniqueNames.push("soft pedalling")
            uniqueNames.push("smoooth")
        }

        if (activity.distance > 0 && activity.elevationGain > 0 && activity.climbingRatio < 0.15) {
            names.push("flatland tour")
            names.push("ride along some massive hills")
        }
    }

    // Running.
    else if (isRun) {
        if ((imperial && activity.distance >= 52) || activity.distance >= 84) {
            uniqueNames.push("when a marathon is not enough")
            uniqueNames.push("double marathon")
        } else if ((imperial && activity.distance >= 26) || activity.distance >= 42) {
            names.push("marathon")
        } else if (distanceR == 10) {
            names.push("10K")
            names.push("10K or 6 miles?")
        } else if (((imperial && activity.distance < 2.5) || activity.distance < 4) && activity.distance > 0) {
            names.push("super short run")
            names.push("mini workout")
        }
    }

    // High elevation gain.
    if ((!imperial && activity.elevationGain > 6000) || activity.elevationGain > 19500) {
        uniqueNames.push("everesting")
        uniqueNames.push("the sky is the limit")
        uniqueNames.push("don’t buy upgrades, ride up grades")
        uniqueNames.push("don’t upgrade, go up grades")
    } else if ((!imperial && activity.elevationGain > 2000) || activity.elevationGain > 6500) {
        names.push("roller coaster")
        names.push("tour with lots of elevation")
    }

    // Ultra long or short workouts.
    if (activity.movingTime > 43200) {
        uniqueNames.push("a long, long day")
        uniqueNames.push("short tour around the block")
        uniqueNames.push("keep going, never stop")
    } else if (activity.movingTime > 28800) {
        names.push("many-hours tour")
        names.push("short tour around the block")
    } else if (activity.distance < 2 && activity.distance > 0) {
        uniqueNames.push("now that was quick")
        uniqueNames.push("training for the IRONMAN")
        uniqueNames.push("training for the TdF")
    }

    // Lots of calories.
    if (activity.calories > 6000) {
        uniqueNames.push("a week's worth of calories")
        uniqueNames.push("energy galore")
    } else if (activity.calories > 4000) {
        names.push("caloric extermination")
        names.push("caloric workout")
    }

    // High heart rate.
    if (activity.hrMax > 210 || activity.hrAvg > 170) {
        uniqueNames.push("heart stress test")
        uniqueNames.push("cardiovascular festival")
    }

    // High cadence.
    if (activity.cadenceAvg > 120) {
        uniqueNames.push("the knitting machine")
        uniqueNames.push("RPM")
    }
    if (activity.cadenceAvg > 100) {
        names.push("knitting machine")
    }

    // Matching properties.
    if (distanceR == speedAvgR) {
        uniqueNames.push(`${distanceR} / ${speedAvgR}`)
    }

    // Sequencing.
    if (distanceR == 123 || activity.wattsAvg == 123 || activity.relativeEffort == 123 || activity.hrAvg == 123) {
        uniqueNames.push("one two three")
    } else if (distanceR == 321 || activity.wattsAvg == 321 || activity.relativeEffort == 321) {
        uniqueNames.push("three two one")
    }

    for (let value of [distanceR, elevationGainR, activity.wattsAvg, activity.wattsMax, activity.relativeEffort, activity.hrAvg]) {
        const aValue = value ? value.toString() : ""
        if (aValue.length > 2 && /^(.)\1+$/.test(aValue)) {
            seqCount++
        }
    }
    if (seqCount > 2) {
        uniqueNames.push("royal straight flush")
    } else if (seqCount > 1) {
        names.push("straight flush")
    }

    // Commutes.
    if (activity.commute) {
        if (names.length > 0) {
            prefixes.push("commute:")
            prefixes.unshift("yet another commute:")
        } else {
            names.push("commute")
        }
    }

    // Weather based checks for 30% of non-PRO and 90% of PRO users, but only
    // for activities that happened on the last 2 days.
    const rndWeather = user.isPro ? 0.91 : 0.31
    if (activity.hasLocation && now.subtract(2, "days").isBefore(activity.dateEnd) && Math.random() < rndWeather) {
        const weatherUnit = user.preferences ? user.preferences.weatherUnit : null

        // Force language to English.
        const preferences = _.cloneDeep(user.preferences)
        preferences.language = "en"

        // Fetch weather summary for activity.
        const weatherSummary = await weather.getActivityWeather(activity, preferences)
        if (weatherSummary) {
            let wPrefixes: string[] = []

            // Check for weather on start and end of the activity.
            for (let summary of [weatherSummary.start, weatherSummary.end]) {
                if (!summary) continue

                const temperature = parseFloat(summary.temperature.toString().replace(/[^\d.-]/g, ""))
                const precipitation = summary.precipitation ? summary.precipitation.toLowerCase() : ""
                const random = Math.random()

                if ((weatherUnit == "f" && temperature < 23) || temperature < -5) {
                    uniqueNames.push("ice age")
                    uniqueNames.push("frostbite festival")
                    uniqueNames.push("feels like summer")
                } else if ((weatherUnit == "f" && temperature > 95) || temperature > 35) {
                    uniqueNames.push("melting")
                    uniqueNames.push("outdoor sauna")
                    uniqueNames.push("doesn't feel warm, at all")
                } else if ((weatherUnit == "f" && temperature < 33) || temperature < 1) {
                    wPrefixes.push(random > 0.5 ? "freezing" : "icy")
                } else if ((weatherUnit == "f" && temperature < 51) || temperature < 11) {
                    wPrefixes.push(random > 0.5 ? "chilly" : "cold")
                } else if ((weatherUnit == "f" && temperature > 86) || temperature > 30) {
                    wPrefixes.push(random > 0.5 ? "tropical" : "hot")
                } else if ((weatherUnit == "f" && temperature > 68) || temperature > 20) {
                    wPrefixes.push(random > 0.5 ? "warm" : "cozy")
                }

                if (precipitation.includes("snow")) {
                    wPrefixes.push(random > 0.5 ? "snowy" : "snow-powdered")
                } else if (precipitation.includes("rain") || precipitation.includes("drizzle")) {
                    wPrefixes.push(random > 0.5 ? "raining" : "wet")
                }
            }

            // Weather prefixes were set? Append them to the original prefixes.
            if (wPrefixes.length > 0) {
                prefixes = prefixes.map((p) => `${_.sample(wPrefixes)} ${p}`)
            }

            usingWeather = true
        }
    }

    // No uniqe names or names? Maybe just use the basic stuff, 10% chances.
    if (uniqueNames.length == 0 && names.length == 0 && Math.random() < 0.11) {
        if (isRide) {
            names.push("ride")
            names.push("tour")
            names.push("bike ride")
            names.push("bike tour")
        }
    }

    // Build resulting string.
    // If unique names were set, use one with 90% chance.
    // If regular names were set, use it with a 70% chance.
    // Everything else, use a funny quote.
    let result: string
    if (uniqueNames.length > 0 && Math.random() < 0.91) {
        result = _.sample(uniqueNames)
    } else if (names.length > 0 && Math.random() < 0.71) {
        result = `${_.sample(prefixes)} ${_.sample(names)}`.trim()
    }

    result = result ? result.charAt(0).toUpperCase() + result.slice(1) : _.sample(fortuneCookies)
    logger.info("Fortune.getActivityFortune", `Activity ${activity.id}`, `${usingWeather ? "with" : "withour"} weather`, result)

    return result
}
