import colors from "vuetify/util/colors"
import fs from "node:fs"
import {stopDevTunnel} from "./server/utils/tunnel.ts"

/**
 * Hosts allowed to access the dev server (for example via a tunnel), taken from the
 * app.url on the SMU_app_url env variable and on the local (gitignored) settings files.
 */
const getDevAllowedHosts = (): string[] => {
    const urls: string[] = [process.env.SMU_app_url]

    for (const file of ["settings.local.json", "settings.secret.json"]) {
        try {
            const content = fs.readFileSync(file, "utf8")
            try {
                urls.push(JSON.parse(content).app?.url)
            } catch (ex) {
                // Settings with comments are not valid JSON, so fallback to a regex.
                urls.push(content.match(/"app"\s*:\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/)?.[1])
            }
        } catch (ex) {
            // File not found, ignore.
        }
    }

    const hosts = urls.filter((url) => !!url).map((url) => URL.parse(url)?.hostname)
    return [...new Set(hosts.filter((host) => !!host && host != "localhost"))]
}

// Most of the server side settings are loaded at runtime via setmeup (settings.json,
// settings.ENV.json and SMU_ environment variables), see server/utils/startup.ts.
export default defineNuxtConfig({
    compatibilityDate: "2026-06-01",
    telemetry: false,

    hooks: {
        ready() {
            if (process.env.NODE_ENV !== "development") return
            const stop = () => stopDevTunnel()
            process.once("SIGINT", stop)
            process.once("SIGTERM", stop)
        },
        close() {
            if (process.env.NODE_ENV === "development") stopDevTunnel()
        }
    },

    // Same as the previous setup, strict mode is disabled.
    typescript: {
        strict: false
    },

    devServer: {
        port: 3000
    },

    // Page and head defaults.
    app: {
        head: {
            titleTemplate: "Strautomator - %s",
            title: "Strautomator",
            meta: [{charset: "utf-8"}, {name: "viewport", content: "width=device-width, initial-scale=1"}, {name: "description", content: "Turbocharge your Strava activities with automated rules! Strautomator is like IFTTT, but for Strava"}],
            link: [
                {rel: "icon", type: "image/x-icon", href: "/favicon.png"},
                {rel: "preconnect", href: "https://fonts.googleapis.com"},
                {rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: ""},
                {rel: "stylesheet", href: "https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900&display=swap"}
            ],
            // Vuetify relies on CSS cascade layers, and their order is defined by whichever stylesheet declares them
            // first. Component styles can load before the main Vuetify styles, so the order must be set upfront.
            style: [
                {
                    key: "vuetify-layers",
                    tagPriority: "critical",
                    innerHTML:
                        "@layer vuetify-core{@layer reset,base}@layer vuetify-components;@layer vuetify-overrides;@layer vuetify-utilities{@layer theme-base,typography,helpers,theme-background,theme-foreground}@layer vuetify-final{@layer transitions,trumps}"
                }
            ],
            script: [{src: "https://cdn.paddle.com/paddle/v2/paddle.js", crossorigin: "anonymous"}]
        }
    },

    // Global styles.
    css: ["@mdi/font/css/materialdesignicons.css", "~/assets/styles.scss"],

    modules: ["@pinia/nuxt", "vuetify-nuxt-module"],

    // Keep whitespace between elements like Vue 2 did (e.g. icons followed by text).
    vue: {
        compilerOptions: {
            whitespace: "preserve"
        }
    },

    // Nitro server options.
    nitro: {
        preset: "node-server",
        // The core settings files are loaded relative to the package folder, so it must
        // be fully copied to the output instead of having only the traced files.
        traceDeps: ["strautomator-core*", "setmeup", "anyhow"]
    },

    // The Vite / Vue build options.
    vite: {
        server: {
            allowedHosts: getDevAllowedHosts(),
            // Vite serves the same CSS URL either as CSS or as a JS module depending on the request
            // headers, so dev responses must never be cached by browsers or proxies (Cloudflare).
            headers: {"Cache-Control": "no-store"}
        },
        plugins: [
            {
                // Cloudflare revalidates its cached copies with conditional requests, and a 304 from Vite
                // would keep serving a stale (and possibly wrong) variant through the tunnel.
                name: "strautomator-dev-tunnel-nocache",
                apply: "serve",
                configureServer(server) {
                    server.middlewares.use((req, _res, next) => {
                        if (req.headers["cf-ray"]) {
                            delete req.headers["if-none-match"]
                            delete req.headers["if-modified-since"]
                        }
                        next()
                    })
                }
            }
        ],
        optimizeDeps: {
            include: ["json-editor-vue", "vanilla-jsoneditor"]
        }
    },

    // Vuetify options.
    vuetify: {
        moduleOptions: {
            styles: {configFile: "app/assets/vuetify-settings.scss"},
            importComposables: ["useDate", "useDisplay", "useTheme"]
        },
        vuetifyOptions: {
            display: {
                thresholds: {md: 960, lg: 1280, xl: 1920, xxl: 2560}
            },
            icons: {
                defaultSet: "mdi"
            },
            // Inputs and selection controls were primary colored by default on Vuetify 2.
            defaults: {
                VAutocomplete: {color: "primary"},
                VCheckbox: {color: "primary"},
                VCheckboxBtn: {color: "primary"},
                VCombobox: {color: "primary"},
                VRadio: {color: "primary"},
                VRadioGroup: {color: "primary"},
                VRangeSlider: {color: "primary"},
                VSelect: {color: "primary"},
                VSlider: {color: "primary"},
                VSwitch: {color: "primary"},
                VTextarea: {color: "primary"},
                VTextField: {color: "primary"}
            },
            theme: {
                defaultTheme: "dark",
                themes: {
                    dark: {
                        dark: true,
                        colors: {
                            background: "#121212",
                            surface: "#1e1e1e",
                            "surface-bright": "#bdbdbd",
                            primary: colors.amber.darken3,
                            secondary: colors.amber.lighten4,
                            accent: colors.grey.darken3,
                            toolbar: colors.grey.darken4,
                            info: colors.grey.lighten1,
                            warning: colors.amber.base,
                            error: colors.deepOrange.accent4,
                            removal: colors.red.darken3,
                            success: colors.lightGreen.darken4,
                            // Text over colored backgrounds was always white on the Vuetify 2 dark theme.
                            "on-primary": "#ffffff",
                            "on-secondary": "#ffffff",
                            "on-accent": "#ffffff",
                            "on-toolbar": "#ffffff",
                            "on-info": "#ffffff",
                            "on-warning": "#ffffff",
                            "on-error": "#ffffff",
                            "on-removal": "#ffffff",
                            "on-success": "#ffffff"
                        }
                    }
                }
            }
        }
    }
})
