<template>
    <div>
        <feature-title header="Let AI name your activities" />

        <v-card color="black" class="mb-4 home-panel">
            <v-card-text>
                <div class="text-left">
                    <p>
                        Tired of boring Strava activity names? Strautomator uses AI to generate unique titles, descriptions and poems to your activities! Your activity metadata, efforts and weather conditions are all taken into consideration when
                        generating the content.
                    </p>
                    <v-img class="mb-8" src="/images/feature/action-auto-generate.png"></v-img>

                    <h2 class="mb-2">Multiple AI providers</h2>
                    <ul class="ml-n2 mb-6">
                        <li>Anthropic (Claude)</li>
                        <li>DeepSeek</li>
                        <li>Google (Gemini)</li>
                        <li>Mistral (Mistral AI)</li>
                        <li>OpenAI (ChatGPT)</li>
                        <li>SpaceXAI (Grok)</li>
                        <li>Z.ai (GLM)</li>
                    </ul>

                    <p>PRO users will have unlimited use and access to the most advanced models. Users with a free account are limited to a maximum of 10% of processed activities using AI, with access to smaller models only.</p>
                    <p>To use this feature, you have the following automation actions:</p>
                    <ul class="ml-n2 mb-4">
                        <li>Generate the activity name with AI</li>
                        <li>Generate a poem with AI</li>
                    </ul>
                    <p>Additionally, PRO users can also get <a href="/feature/ai-insights">AI insights</a> for their activities.</p>
                </div>
            </v-card-text>
        </v-card>

        <div class="mt-6 mb-2">
            <buttons-automations />
        </div>
    </div>
</template>

<script setup lang="ts">
definePageMeta({layout: "feature"})
useHead({title: "Strava activities names and descriptions with AI"})
</script>
