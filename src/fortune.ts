// Strautomator Core: Strava Fortune

import {StravaActivity, StravaSport} from "./strava/types"
import {UserData} from "./users/types"
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
export const getActivityFortune = (user: UserData, activity: StravaActivity): string => {
    const imperial = user.profile.units == "imperial"
    const prefixes = ["", "delightful", "amazing", "great", "", "just your regular", "crazy", "superb", "", "magnificent", "marvellous", "exotic", ""]
    const names = []
    const uniqueNames = []

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
        prefixes.push("turbo trainer:")
        prefixes.unshift("indoor:")
    }

    // Cycling.
    if (activity.type == StravaSport.Ride || activity.type == StravaSport.VirtualRide || activity.type == StravaSport.EBikeRide) {
        if (activity.distance >= 500) {
            uniqueNames.push("almost a lap around the world")
            uniqueNames.push("short and easy that was")
        } else if (activity.distance >= 200 && activity.distance <= 220) {
            names.push("double century ride")
            names.push("century x2")
        } else if (activity.distance >= 100 && activity.distance <= 110) {
            names.push("century ride")
        } else if (activity.distance > 99 && activity.distance < 100) {
            names.push("almost-a-century ride")
            names.push("and so close to 3 digits")
        } else if ((imperial && distanceR == 26) || distanceR == 42) {
            uniqueNames.push("marathon on two wheels")
            uniqueNames.push("maratho... on a bike")
        } else if (((imperial && activity.distance < 6) || activity.distance) < 10 && activity.distance > 0) {
            names.push("and short, too short of a ride")
            names.push("short, very short ride")
            names.push("shorty")
        }

        if ((imperial && activity.speedAvg > 31) || activity.speedAvg >= 50) {
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
        } else if (activity.wattsAvg < 100 && activity.wattsAvg > 0) {
            names.push("easy does it")
            names.push("soft pedalling")
        }

        if (activity.distance > 0 && activity.elevationGain > 0 && activity.climbingRatio <= 0.1) {
            names.push("flatland tour")
            names.push("ride through some massive hills")
        }
    }

    // Running.
    else if (activity.type == StravaSport.Run || activity.type == StravaSport.Walk) {
        if ((imperial && activity.distance >= 52) || activity.distance >= 84) {
            uniqueNames.push("when a marathon is not enough")
            uniqueNames.push("double marathon")
        } else if ((imperial && activity.distance >= 26) || activity.distance >= 42) {
            names.push("marathon")
        } else if (distanceR == 10) {
            names.push("10K")
            names.push("10K or 6 miles?")
        } else if (((imperial && activity.distance < 3) || activity.distance < 5) && activity.distance > 0) {
            names.push("super short run")
            names.push("mini workout")
        }
    }

    // High elevation gain.
    if ((!imperial && activity.elevationGain > 8000) || activity.elevationGain > 27000) {
        uniqueNames.push("everesting")
        uniqueNames.push("the sky is the limit")
        uniqueNames.push("don’t buy upgrades, ride up grades")
        uniqueNames.push("don’t upgrade, go up grades")
    } else if ((!imperial && activity.elevationGain > 2500) || activity.elevationGain > 9000) {
        names.push("higher and higher")
        names.push("roller coaster")
        names.push("way up to the sky")
    }

    // Ultra long workouts or short workouts.
    if (activity.movingTime > 86400) {
        uniqueNames.push("keep going, never stop")
        uniqueNames.push("that was a long day")
    } else if (activity.movingTime > 28800) {
        uniqueNames.push("call it a work day")
    } else if (activity.distance < 1) {
        uniqueNames.push("now that was quick")
        uniqueNames.push("training for the IRONMAN")
        uniqueNames.push("training for the TdF")
    }

    // Lots of calories.
    if (activity.calories > 10000) {
        uniqueNames.push("a week's worth of calories")
        uniqueNames.push("energy galore")
    } else if (activity.calories > 5000) {
        names.push("caloric extermination")
        names.push("caloric workout")
    }

    // High heart rate.
    if (activity.hrMax > 200) {
        uniqueNames.push("heart stress test")
    }

    // High cadence.
    if (activity.cadenceAvg > 120) {
        names.push("ultra fast knitting machine")
    }
    if (activity.cadenceAvg > 100) {
        names.push("knitting machine")
    }

    // Matching properties.
    if (distanceR == speedAvgR) {
        uniqueNames.push(`${distanceR} / ${speedAvgR}`)
    }
    if (elevationGainR == 1234) {
        uniqueNames.push("one two three four")
    }

    // Commutes.
    if (activity.commute) {
        if (names.length > 0) {
            prefixes.push("commute:")
            prefixes.unshift("yet another commute:")
        } else {
            names.push("commuting around")
            names.push("commute galore")
        }
    }

    // Build resulting string.
    // If unique names were set, use one with 90% chance.
    // If regulr names were set, use it with a 70% chance.
    // Everything else, use a funny quote.
    let result: string
    if (uniqueNames.length > 0 && Math.random() < 0.91) {
        result = _.sample(uniqueNames)
    } else if (names.length > 0 && Math.random() < 0.71) {
        result = `${_.sample(prefixes)} ${_.sample(names)}`.trim()
    }

    result = result ? result.charAt(0).toUpperCase() + result.slice(1) : _.sample(fortuneCookies)
    logger.info("Fortune.getActivityFortune", `Activity ${activity.id}`, result)

    return result
}
