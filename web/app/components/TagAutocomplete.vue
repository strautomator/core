<template>
    <div ref="root" class="tag-autocomplete">
        <v-textarea v-if="textarea" v-bind="attrs" :model-value="model" @update:model-value="onModelUpdate" @keydown="onKeydown" @click="refreshMenu" @keyup="onKeyup" @focus="refreshMenu" @blur="onBlur"></v-textarea>
        <v-text-field v-else v-bind="attrs" :model-value="model" @update:model-value="onModelUpdate" @keydown="onKeydown" @click="refreshMenu" @keyup="onKeyup" @focus="refreshMenu" @blur="onBlur"></v-text-field>
        <v-menu v-model="menu" activator="parent" location="bottom start" :close-on-content-click="false" :open-on-click="false" :open-on-focus="false" :min-width="280" max-height="320">
            <v-list density="compact" class="tag-autocomplete-list">
                <v-list-item v-for="(item, index) in filteredItems" :key="getItemValue(item)" :active="index == selectedIndex" @mousedown.prevent="selectItem(item)" @mouseenter="selectedIndex = index">
                    <slot name="item" :item="item" :selected="index == selectedIndex">
                        <v-list-item-title>{{ getItemValue(item) }}</v-list-item-title>
                        <v-list-item-subtitle>{{ getItemTitle(item) }}</v-list-item-subtitle>
                    </slot>
                </v-list-item>
                <v-list-item v-if="filteredItems.length == 0" disabled>
                    <v-list-item-title>No matching tags</v-list-item-title>
                </v-list-item>
            </v-list>
        </v-menu>
    </div>
</template>

<style scoped>
.tag-autocomplete {
    position: relative;
    width: 100%;
}
.tag-autocomplete-list {
    max-height: 320px;
    overflow-y: auto;
}
</style>

<script setup lang="ts">
defineOptions({inheritAttrs: false})

interface TagItem {
    [key: string]: any
}

interface ActiveToken {
    key: string
    start: number
    end: number
    query: string
}

const props = withDefaults(
    defineProps<{
        items: TagItem[]
        keys?: string[]
        itemTitle?: string
        itemValue?: string
        textarea?: boolean
    }>(),
    {
        keys: () => ["$"],
        itemTitle: "label",
        itemValue: "value",
        textarea: false
    }
)

const attrs = useAttrs()
const model = defineModel<string>({default: ""})
const root = ref<HTMLElement | null>(null)
const menu = ref(false)
const selectedIndex = ref(0)
const activeToken = ref<ActiveToken | null>(null)

const normalize = (value: string): string => value.replace(/^[$]+/, "").replace(/[{}]/g, "").toLowerCase()
const getItemValue = (item: TagItem): string => item?.[props.itemValue]?.toString() || ""
const getItemTitle = (item: TagItem): string => item?.[props.itemTitle]?.toString() || item?.text?.toString() || item?.label?.toString() || ""

const filteredItems = computed(() => {
    const query = normalize(activeToken.value?.query || "")
    const matches = props.items.filter((item) => {
        if (!query) return true
        const value = normalize(getItemValue(item))
        const title = getItemTitle(item).toLowerCase()
        return value.includes(query) || title.includes(query)
    })

    return matches.sort((a, b) => {
        if (!query) return 0
        const aValue = normalize(getItemValue(a))
        const bValue = normalize(getItemValue(b))
        const aTitle = getItemTitle(a).toLowerCase()
        const bTitle = getItemTitle(b).toLowerCase()
        const aPrefix = aValue.startsWith(query) || aTitle.startsWith(query)
        const bPrefix = bValue.startsWith(query) || bTitle.startsWith(query)
        return Number(bPrefix) - Number(aPrefix)
    })
})

watch(filteredItems, () => (selectedIndex.value = 0))

/**
 * Returns the wrapped native text input element.
 */
const getInputElement = (): HTMLInputElement | HTMLTextAreaElement | null => root.value?.querySelector("textarea, input") || null

/**
 * Returns the active tag token at the caret, if any.
 */
const getActiveToken = (): ActiveToken | null => {
    const input = getInputElement()
    if (!input || document.activeElement != input) return null

    const text = model.value || ""
    const caret = input.selectionStart ?? text.length
    let best: ActiveToken | null = null

    for (const key of props.keys) {
        const start = text.lastIndexOf(key, Math.max(0, caret - 1))
        if (start < 0) continue

        const query = text.substring(start + key.length, caret)
        const blocked = props.keys.some((k) => query.includes(k)) || /\s/.test(query)
        if (blocked) continue
        if (!best || start > best.start) best = {key, start, end: getTagEnd(text, start + key.length, caret), query}
    }

    return best
}

/**
 * Returns where the tag ends, so the whole tag is replaced when the caret is inside a braced tag like {distance}.
 */
const getTagEnd = (text: string, tagStart: number, caret: number): number => {
    const excluded = props.keys.map((k) => k.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join("")
    const tag = text.substring(tagStart).match(new RegExp(`^\\{[^\\s{}${excluded}]*\\}?`))
    const tagEnd = tag ? tagStart + tag[0].length : -1
    return tagEnd > caret ? tagEnd : caret
}

/**
 * Refresh the menu visibility and active query from the current caret position.
 */
const refreshMenu = () => {
    activeToken.value = getActiveToken()
    menu.value = !!activeToken.value
}

/**
 * Refresh the menu on key up, except for keys handled by the menu navigation itself.
 */
const onKeyup = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return
    refreshMenu()
}

/**
 * Update the wrapped input value and refresh autocomplete state.
 */
const onModelUpdate = (value: string) => {
    model.value = value || ""
    nextTick(refreshMenu)
}

/**
 * Handle keyboard navigation and selection while the autocomplete is open.
 */
const onKeydown = (event: KeyboardEvent) => {
    if (!menu.value) return

    if (event.key == "ArrowDown") {
        event.preventDefault()
        selectedIndex.value = Math.min(selectedIndex.value + 1, filteredItems.value.length - 1)
    } else if (event.key == "ArrowUp") {
        event.preventDefault()
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    } else if (event.key == "Enter" || event.key == "Tab") {
        if (filteredItems.value[selectedIndex.value]) {
            event.preventDefault()
            selectItem(filteredItems.value[selectedIndex.value])
        }
    } else if (event.key == "Escape") {
        event.preventDefault()
        menu.value = false
    }
}

/**
 * Close the menu after the input blur unless a list click selects an item first.
 */
const onBlur = () => {
    window.setTimeout(() => {
        menu.value = false
    }, 150)
}

/**
 * Replace the active tag token with the selected item value and restore the caret.
 */
const selectItem = (item: TagItem) => {
    const token = activeToken.value || getActiveToken()
    if (!token) return

    const text = model.value || ""
    const insertion = `${token.key}${getItemValue(item)}`
    const nextValue = `${text.substring(0, token.start)}${insertion}${text.substring(token.end)}`
    const caret = token.start + insertion.length

    model.value = nextValue
    menu.value = false
    activeToken.value = null

    nextTick(() => {
        const input = getInputElement()
        input?.focus()
        input?.setSelectionRange(caret, caret)
    })
}
</script>
