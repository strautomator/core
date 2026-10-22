// Strautomator Web: GearWear helpers

/**
 * GearWear helpers.
 */
export const useGearwear = () => {
    const store = useMainStore()

    const getGearType = (gear: any): string => (gear.id.substring(0, 1) == "b" ? "Bike" : "Shoes")

    const getGearIcon = (gear: any): string => (gear.id.substring(0, 1) == "b" ? "mdi-bike" : "mdi-shoe-print")

    const getGearHours = (seconds: number): string | number => {
        if (!seconds) return 0
        return (seconds / 3600).toFixed(1).replace(".0", "")
    }

    const getComponentIcon = (comp: any): string => {
        const name = comp?.name.toLowerCase().replace(/ /g, "") || ""
        if (name.includes("battery")) return "mdi-battery-70"
        if (name.includes("bearing") || name.includes("headset") || name.includes("bottombracket")) return "mdi-dots-circle"
        if (name.includes("brake")) return "mdi-car-brake-worn-linings"
        if (name.includes("cassette") || name.includes("drivetrain")) return "mdi-cog-outline"
        if (name.includes("chain")) return "mdi-link"
        if (name.includes("cleat")) return "mdi-shoe-cleat"
        if (name.includes("pedal")) return "mdi-bike-pedal"
        if (name.includes("suspension")) return "mdi-piston"
        if (name.includes("sealant")) return "mdi-water-opacity"
        if (name.includes("tire") || name.includes("tyre")) return "mdi-tire"
        if (name.includes("oil") || name.includes("wax")) return "mdi-oil"
        if (name.includes("hydro")) return "mdi-hydraulic-oil-level"
        if (name.includes("shoe")) return "mdi-shoe-sneaker"
        if (name.includes("clean")) return "mdi-liquid-spot"
        return "mdi-wrench-cog"
    }

    const getDeviceIdName = (id: string): string =>
        id
            .split(".")
            .map((v) => v.charAt(0).toUpperCase() + v.slice(1))
            .join(" ")

    const getFitDeviceName = (id: string): string => {
        const user = store.user
        return user?.fitDeviceNames ? user.fitDeviceNames[id] || "" : ""
    }

    return {getGearType, getGearIcon, getGearHours, getComponentIcon, getDeviceIdName, getFitDeviceName}
}
