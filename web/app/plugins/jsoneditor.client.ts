// Strautomator Web: JSON editor (client only)

import JsonEditorVue from "json-editor-vue"

export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.vueApp.use(JsonEditorVue, {
        mode: "text",
        askToFormat: false,
        mainMenuBar: false,
        navigationBar: false,
        statusBar: false
    })
})
