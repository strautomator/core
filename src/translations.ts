// Strautomator Core: Translations

import {UserPreferences} from "./users/types"
import logger = require("anyhow")

/**
 * Set of language strings.
 */
interface LanguageString {
    Description: string
    Cool: string
    Cold: string
    Warm: string
    VeryCold: string
    VeryWarm: string
    ExtremelyCold: string
    ExtremelyWarm: string
    Precipitation: string
    Dry: string
    Rain: string
    Drizzle: string
    Snow: string
    Sleet: string
    Heavy: string
    Temp: string
    Humidity: string
    Wind: string
    Windy: string
    Fog: string
    Organizer: string
    Distance: string
    ElevationGain: string
    Speed: string
    Calories: string
    Clear: string
    MostlyClear: string
    PartlyCloudy: string
    Cloudy: string
    MostlyCloudy: string
    Thunderstorm: string
    Tornado: string
    Hurricane: string
}

/**
 * Map of translated strings in multiple languages.
 */
const languageStrings: {[id: string]: LanguageString} = {
    en: {
        Description: "description",
        Cool: "cool",
        Cold: "cold",
        Warm: "warm",
        VeryCold: "very cold",
        VeryWarm: "very warm",
        ExtremelyCold: "extremely cold",
        ExtremelyWarm: "extremely warm",
        Precipitation: "precipitation",
        Dry: "dry",
        Rain: "rain",
        Drizzle: "drizzle",
        Snow: "snow",
        Sleet: "sleet",
        Heavy: "heavy",
        Temp: "temp",
        Humidity: "humidity",
        Wind: "wind",
        Windy: "windy",
        Fog: "fog",
        Organizer: "organizer",
        Distance: "distance",
        ElevationGain: "elevation gain",
        Speed: "speed",
        Calories: "calories",
        Clear: "clear",
        MostlyClear: "mostly clear",
        PartlyCloudy: "partly cloudy",
        Cloudy: "cloudy",
        MostlyCloudy: "mostly cloudy",
        Thunderstorm: "thunderstorm",
        Hurricane: "hurricane",
        Tornado: "tornado"
    },
    de: {
        Description: "beschreibung",
        Cool: "frisch",
        Warm: "warm",
        Cold: "kalt",
        VeryCold: "sehr kalt",
        VeryWarm: "sehr warm",
        ExtremelyCold: "extrem kalt",
        ExtremelyWarm: "extrem warm",
        Precipitation: "niederschlagsmenge",
        Dry: "trocken",
        Rain: "regen",
        Drizzle: "nieselregen",
        Snow: "schnee",
        Sleet: "schneeregen",
        Heavy: "stark",
        Temp: "temp",
        Humidity: "luftfeuchtigkeit",
        Wind: "wind",
        Windy: "windig",
        Fog: "nebel",
        Organizer: "ausrichter",
        Distance: "distanz",
        ElevationGain: "höhenmeter",
        Speed: "geschwindigkeit",
        Calories: "kalorien",
        Clear: "klar",
        MostlyClear: "meist klarer",
        PartlyCloudy: "meist klarer",
        Cloudy: "bewölkt",
        MostlyCloudy: "meist bewölkt",
        Thunderstorm: "gewitter",
        Hurricane: "hurrikan",
        Tornado: "tornado"
    },
    es: {
        Description: "descripción",
        Cool: "fresco",
        Warm: "cálido",
        Cold: "frío",
        VeryCold: "muy frío",
        VeryWarm: "muy cálido",
        ExtremelyCold: "extremadamente frío",
        ExtremelyWarm: "extremadamente cálido",
        Precipitation: "precipitación",
        Dry: "seco",
        Rain: "lluvia",
        Drizzle: "llovizna",
        Snow: "nieve",
        Sleet: "aguanieve",
        Heavy: "fuerte",
        Temp: "temp",
        Humidity: "humedad",
        Wind: "viento",
        Windy: "ventoso",
        Fog: "niebla",
        Organizer: "organizador",
        Distance: "distancia",
        ElevationGain: "desnivel",
        Speed: "velocidad",
        Calories: "calorías",
        Clear: "claro",
        MostlyClear: "mayormente claro",
        PartlyCloudy: "mayormente claro",
        Cloudy: "mublado",
        MostlyCloudy: "mayormente nublado",
        Thunderstorm: "tormenta",
        Hurricane: "huracán",
        Tornado: "tornado"
    },
    fr: {
        Description: "description",
        Cool: "frais",
        Warm: "chaud",
        Cold: "froid",
        VeryCold: "très froid",
        VeryWarm: "très chaud",
        ExtremelyCold: "très froid",
        ExtremelyWarm: "extrêmement chaud",
        Precipitation: "extrêmement froid",
        Dry: "sec",
        Rain: "pluie",
        Drizzle: "bruine",
        Snow: "neiger",
        Sleet: "neige fondue",
        Heavy: "forte",
        Temp: "temp",
        Humidity: "humidité",
        Wind: "vent",
        Windy: "venteux",
        Fog: "brouillard",
        Organizer: "organisateur",
        Distance: "distance",
        ElevationGain: "gain d'altitude",
        Speed: "vitesse",
        Calories: "calories",
        Clear: "ciel clair",
        MostlyClear: "ciel généralement dégagé",
        PartlyCloudy: "ciel généralement dégagé",
        Cloudy: "nuageux",
        MostlyCloudy: "plutôt nuageux",
        Thunderstorm: "orage",
        Hurricane: "ouragan",
        Tornado: "tornade"
    },
    it: {
        Description: "descrizione",
        Cool: "fresco",
        Cold: "freddo",
        Warm: "caldo",
        VeryCold: "molto freddo",
        VeryWarm: "molto caldo",
        ExtremelyCold: "estremamente freddo",
        ExtremelyWarm: "estremamente caldo",
        Precipitation: "precipitazione",
        Dry: "secco",
        Rain: "pioggia",
        Drizzle: "pioggerella",
        Snow: "neve",
        Sleet: "nevischio",
        Heavy: "forte",
        Temp: "temp",
        Humidity: "umidità",
        Wind: "vento",
        Windy: "ventoso",
        Fog: "nebbia",
        Organizer: "promotore",
        Distance: "distanza",
        ElevationGain: "dislivello",
        Speed: "velocità",
        Calories: "calorie",
        Clear: "sereno",
        MostlyClear: "per lo più chiaro",
        PartlyCloudy: "parzialmente nuvoloso",
        Cloudy: "nuvoloso",
        MostlyCloudy: "prevalentemente nuvoloso",
        Thunderstorm: "temporale",
        Hurricane: "uragano",
        Tornado: "tornado"
    },
    pl: {
        Description: "opis",
        Cool: "chłodno",
        Cold: "zimno",
        Warm: "ciepło",
        VeryCold: "bardzo zimno",
        VeryWarm: "bardzo ciepło",
        ExtremelyCold: "skrajnie zimno",
        ExtremelyWarm: "skrajnie ciepło",
        Precipitation: "opady",
        Dry: "brak",
        Rain: "deszcz",
        Drizzle: "mżawka",
        Snow: "śnieg",
        Sleet: "deszcz ze śniegiem",
        Heavy: "mocny",
        Temp: "temp",
        Humidity: "wilgotność",
        Wind: "wiatr",
        Windy: "wietrznie",
        Fog: "mgła",
        Organizer: "organizator",
        Distance: "odległość",
        ElevationGain: "różnica wysokości",
        Speed: "prędkość",
        Calories: "kalorie",
        Clear: "bezchmurnie",
        MostlyClear: "prawie bezchmurnie",
        PartlyCloudy: "częściowo pochmurnie",
        Cloudy: "pochmurnie",
        MostlyCloudy: "głównie pochmurnie",
        Thunderstorm: "burza",
        Hurricane: "huragan",
        Tornado: "tornado"
    },
    pt: {
        Description: "descrição",
        Cool: "fresco",
        Cold: "frio",
        Warm: "quente",
        VeryCold: "muito frio",
        VeryWarm: "muito quente",
        ExtremelyCold: "extremamente frio",
        ExtremelyWarm: "extremamente quente",
        Precipitation: "precipitação",
        Dry: "seco",
        Rain: "chuva",
        Drizzle: "chuvisco",
        Snow: "neve",
        Sleet: "granizo",
        Heavy: "forte",
        Temp: "temp",
        Humidity: "humidade",
        Wind: "vento",
        Windy: "ventando",
        Fog: "neblina",
        Organizer: "organizador",
        Distance: "distância",
        ElevationGain: "elevação",
        Speed: "velocidade",
        Calories: "calorias",
        Clear: "céu aberto",
        MostlyClear: "parcialmente aberto",
        PartlyCloudy: "parcialmente nublado",
        Cloudy: "nublado",
        MostlyCloudy: "parcialmente nublado",
        Thunderstorm: "tempestade",
        Hurricane: "furacão",
        Tornado: "tornado"
    }
}

/**
 * Returns a translated string.
 * @param id ID of the string to be translated.
 * @param preferences User preferences with language set.
 * @param capitalized Optional, return string capitalized
 */
export const translation = (id: string, preferences: UserPreferences, capitalized?: boolean): string => {
    let language = preferences ? preferences.language : "en"
    if (!language || !languageStrings[language]) {
        language = "en"
    }

    if (!id) {
        logger.warn("Translations.translation", language, "Translation ID passed as null")
        return ""
    }

    const spaceToBigCase = (w) => w.charAt(0).toUpperCase() + w.slice(1)
    const ref = languageStrings[language]
    const result = ref[id] || ref[id.split(" ").map(spaceToBigCase).join("")]

    if (!result) {
        logger.debug("Translations.translation", language, `No translation found for: ${id}`)
        return id
    }

    return capitalized ? result.charAt(0).toUpperCase() + result.slice(1) : result
}
