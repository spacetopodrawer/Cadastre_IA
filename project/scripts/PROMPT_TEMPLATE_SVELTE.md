<!-- PROMPT_TEMPLATE_SVELTE.md -->

<script lang="ts">
  import { {{STORE_NAME}} } from '$lib/stores';
  export let {{PROPS}};
</script>

<div class="{{COMPONENT_NAME | kebab}}-container">
  <!-- Composant {{COMPONENT_NAME}} -->
</div>

<style>
  .{{COMPONENT_NAME | kebab}}-container {
    @apply w-full h-full p-4;
  }
</style>
