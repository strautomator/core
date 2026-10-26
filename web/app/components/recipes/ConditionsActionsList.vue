<template>
    <div v-if="recipe">
        <ul class="mt-0 pl-4 condition-list">
            <li v-if="recipe.defaultFor">Default automation for all "{{ getSportName(recipe.defaultFor) }}" activities</li>
            <li v-else-if="recipe.conditions.length > 1 && codeLogicalOperator(recipe) == 'ALL'" class="if-then">If <strong>ALL</strong> these conditions are met:</li>
            <li v-else-if="recipe.conditions.length > 1 && codeLogicalOperator(recipe) == 'ANY'" class="if-then">If <strong>ANY</strong> of these conditions are met:</li>
            <li v-else-if="recipe.conditions.length > 2" class="if-then">If these conditions are met:</li>
            <template v-for="(conditions, property, groupIndex) in recipe.groupedConditions" :key="property">
                <v-chip v-if="codeLogicalOperator(recipe) == 'SOME' && Number(groupIndex) > 0" class="ml-n1 mt-1 mb-1" size="small" variant="outlined">{{ recipe.op }}</v-chip>
                <li v-for="(condition, index) in conditions" :key="`${property}-c-${index}`" :class="{or: Number(index) > 0 && codeLogicalOperator(recipe) == 'SOME'}">
                    <span v-if="codeLogicalOperator(recipe) == 'SOME' && Number(index) > 0">{{ recipe.samePropertyOp.toLowerCase() }}</span>
                    {{ conditionSummary(condition) }}
                </li>
            </template>
        </ul>
        <ul class="mt-2 mb-1 pl-4 action-list">
            <li v-if="!recipe.defaultFor && recipe.conditions.length > 1" class="if-then">Then execute these actions:</li>
            <li class="font-weight-medium" v-for="(action, index) in recipe.actions" :key="`action-${index}`">
                {{ actionSummary(action) }}
            </li>
        </ul>
    </div>
</template>

<style>
li.if-then {
    list-style-type: none;
    opacity: 0.4;
}
.action-list {
    list-style-type: disc;
}
.condition-list {
    list-style-type: circle;
}
.condition-list li.or {
    list-style-type: none;
}
</style>

<script setup lang="ts">
defineProps<{recipe: any}>()

const {actionSummary, conditionSummary, codeLogicalOperator} = useRecipe()
const {getSportName} = useStrava()
</script>
