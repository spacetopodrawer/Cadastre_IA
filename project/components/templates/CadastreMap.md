# CadastreMap.svelte

**Type:** PRESENTATION

**Props:**
- config: MapConfig
- interactive: boolean (default: true)

**Événements:**
- Aucun événement émis directement

**Slots:**
- Aucun slot

**Stores utilisés:**
- parcelStore

**Styles:**
- Tailwind

**Tests:**
- UNIT

---

## Description
Composant de carte interactive pour visualiser le cadastre. Utilise le store `parcelStore` pour la gestion des parcelles. Initialise la carte via la prop `config`.

## Utilisation
```svelte
<CadastreMap config={config} interactive={true} />
```

## Export
Ajouter dans `index.ts` :
```ts
export { default as CadastreMap } from './CadastreMap.svelte';
```
