// TEST: WEATHER

let chai = require("chai")
let mocha = require("mocha")
let before = mocha.before
let describe = mocha.describe
let it = mocha.it

chai.should()

describe("Weather Tests", function () {
    const _ = require("lodash")
    const logger = require("anyhow")
    const moment = require("moment")
    const setmeup = require("setmeup")
    const weather = require("../lib/weather").default

    // Test activities and preferences.
    const berlinCoordinates = [52.5422, 13.4143]
    const shortActivity = {id: "short-activity", locationStart: [52.52, 13.4], locationEnd: [53.11, 13.5], dateStart: moment().subtract(3, "h").toDate(), dateEnd: moment().toDate()}
    const longActivity = {id: "long-activity", locationStart: [52.52, 13.4], locationEnd: [53.11, 13.5], dateStart: moment().subtract(14, "h").toDate(), dateEnd: moment().subtract(55, "m").toDate()}
    const noPrefs = {}
    const imperialPrefs = {weatherUnit: "f"}

    before(async function () {
        logger.setup("console")
        setmeup.load()
        setmeup.loadFromEnv()

        await weather.init()
    })

    it("Test ClimaCell", async function () {
        this.timeout(5000)

        try {
            const climacell = require("../lib/weather/climacell").default
            await climacell.init()
            const currentResult = await climacell.getCurrentWeather(berlinCoordinates)
            const shortResult = await climacell.getActivityWeather(shortActivity, noPrefs)
            const longResult = await climacell.getActivityWeather(longActivity, imperialPrefs)
            console.warn("ClimaCell")
            console.dir(currentResult)
            console.dir(shortResult)
            console.dir(longResult)
        } catch (ex) {
            throw ex
        }
    })

    it("Test Dark Sky", async function () {
        this.timeout(5000)

        try {
            const darksky = require("../lib/weather/darksky").default
            await darksky.init()
            const currentResult = await darksky.getCurrentWeather(berlinCoordinates)
            const shortResult = await darksky.getActivityWeather(shortActivity, noPrefs)
            const longResult = await darksky.getActivityWeather(longActivity, imperialPrefs)
            console.warn("Dark Sky")
            console.dir(currentResult)
            console.dir(shortResult)
            console.dir(longResult)
        } catch (ex) {
            throw ex
        }
    })

    it("Test Weatherbit", async function () {
        this.timeout(5000)

        try {
            const weatherbit = require("../lib/weather/weatherbit").default
            await weatherbit.init()
            const currentResult = await weatherbit.getCurrentWeather(berlinCoordinates)
            const shortResult = await weatherbit.getActivityWeather(shortActivity, noPrefs)
            const longResult = await weatherbit.getActivityWeather(longActivity, imperialPrefs)
            console.warn("Weatherbit")
            console.dir(currentResult)
            console.dir(shortResult)
            console.dir(longResult)
        } catch (ex) {
            throw ex
        }
    })

    it("Test OpenWeatherMap", async function () {
        this.timeout(5000)

        try {
            const openweathermap = require("../lib/weather/openweathermap").default
            await openweathermap.init()
            const currentResult = await openweathermap.getCurrentWeather(berlinCoordinates)
            const shortResult = await openweathermap.getActivityWeather(shortActivity, noPrefs)
            const longResult = await openweathermap.getActivityWeather(longActivity, imperialPrefs)
            console.warn("OpenWeatherMap")
            console.dir(currentResult)
            console.dir(shortResult)
            console.dir(longResult)
        } catch (ex) {
            throw ex
        }
    })

    it("Test WeatherAPI.com", async function () {
        this.timeout(5000)

        try {
            const weatherapi = require("../lib/weather/weatherapi").default
            await weatherapi.init()
            const currentResult = await weatherapi.getCurrentWeather(berlinCoordinates)
            const shortResult = await weatherapi.getActivityWeather(shortActivity, noPrefs)
            const longResult = await weatherapi.getActivityWeather(longActivity, imperialPrefs)
            console.warn("WeatherAPI.com")
            console.dir(currentResult)
            console.dir(shortResult)
            console.dir(longResult)
        } catch (ex) {
            throw ex
        }
    })
})
