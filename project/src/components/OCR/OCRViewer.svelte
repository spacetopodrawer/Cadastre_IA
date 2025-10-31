<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { OCRCorrectionMemory } from '$lib/ocr/OCRCorrectionMemory';
  import { auditLog } from '$stores/auditLog';
  import { toast } from 'sonner';
  
  // Props
  export let ocrResult: {
    text: string;
    words?: Array<{
      text: string;
      confidence: number;
      bbox: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
      };
    }>;
    metadata?: {
      filePath?: string;
      processedAt?: string;
      [key: string]: any;
    };
  };

  // State
  let editableText = ocrResult.text;
  let suggestions: Array<{
    original: string;
    corrected: string;
    confidence: number;
    source: 'user' | 'agent' | 'history';
    context?: string;
  }> = [];
  let showSuggestions = false;
  let isLoading = true;

  // Get suggestions when component mounts or OCR result changes
  $: if (ocrResult) {
    loadSuggestions();
  }

  async function loadSuggestions() {
    try {
      isLoading = true;
      suggestions = await OCRCorrectionMemory.getSuggestions(ocrResult.text);
      showSuggestions = suggestions.length > 0;
    } catch (error) {
      console.error('Error loading suggestions:', error);
      toast.error('Erreur lors du chargement des suggestions');
    } finally {
      isLoading = false;
    }
  }

  async function applySuggestion(entry: typeof suggestions[0]) {
    try {
      const regex = new RegExp(`\\b${escapeRegExp(entry.original)}\\b`, 'gi');
      const newText = editableText.replace(regex, entry.corrected);
      
      // Update the displayed text
      editableText = newText;
      
      // Log the correction
      await auditLog.add({
        type: 'ocr_correction_applied',
        message: `Correction appliquée: "${entry.original}" → "${entry.corrected}"`,
        timestamp: new Date().toISOString(),
        details: {
          original: entry.original,
          corrected: entry.corrected,
          source: entry.source,
          confidence: entry.confidence,
          context: entry.context,
          filePath: ocrResult.metadata?.filePath
        }
      });

      // Update the correction in memory (increase confidence)
      await OCRCorrectionMemory.addCorrection({
        original: entry.original,
        correction: entry.corrected,
        source: 'user',
        context: entry.context,
        confidence: Math.min(1, entry.confidence + 0.1) // Increase confidence
      });

      // Remove the applied suggestion
      suggestions = suggestions.filter(s => s.original !== entry.original || s.corrected !== entry.corrected);
      showSuggestions = suggestions.length > 0;
      
      toast.success('Correction appliquée avec succès');
    } catch (error) {
      console.error('Error applying suggestion:', error);
      toast.error('Erreur lors de l\'application de la correction');
    }
  }

  function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function rejectSuggestion(entry: typeof suggestions[0]) {
    // Mark the suggestion as rejected (optional: store in local storage)
    OCRCorrectionMemory.rejectSuggestion(entry.original, entry.corrected);
    
    // Remove from current suggestions
    suggestions = suggestions.filter(s => s.original !== entry.original || s.corrected !== entry.corrected);
    showSuggestions = suggestions.length > 0;
    
    toast.info('Suggestion rejetée');
  }

  // Cleanup
  onDestroy(() => {
    // Any cleanup if needed
  });
</script>

<div class="ocr-viewer">
  <!-- Text area for editing OCR results -->
  <div class="ocr-text-container">
    <h3>Résultat OCR</h3>
    <textarea
      bind:value={editableText}
      class="ocr-textarea"
      placeholder="Résultat OCR..."
    ></textarea>
  </div>

  <!-- Suggestions Panel -->
  {#if isLoading}
    <div class="suggestions-loading">
      <div class="spinner"></div>
      <span>Chargement des suggestions...</span>
    </div>
  {:else if showSuggestions}
    <div class="suggestions-panel">
      <div class="suggestions-header" on:click={() => showSuggestions = !showSuggestions}>
        <h3>💡 Suggestions de correction</h3>
        <span class="badge">{suggestions.length}</span>
        <span class="toggle-icon">{showSuggestions ? '▼' : '▶'}</span>
      </div>
      
      {#if showSuggestions}
        <div class="suggestions-list">
          {#each suggestions as entry (entry.original + entry.corrected)}
            <div class="suggestion-item">
              <div class="suggestion-text">
                <span class="original">{entry.original}</span>
                <span class="arrow">→</span>
                <span class="corrected">{entry.corrected}</span>
                <span class="confidence">
                  {Math.round(entry.confidence * 100)}% de confiance
                  {entry.source === 'agent' ? ' (IA)' : entry.source === 'history' ? ' (Historique)' : ''}
                </span>
              </div>
              <div class="suggestion-actions">
                <button 
                  class="btn-apply" 
                  on:click|stopPropagation={() => applySuggestion(entry)}
                  title="Appliquer la correction"
                >
                  ✅ Appliquer
                </button>
                <button 
                  class="btn-reject" 
                  on:click|stopPropagation={() => rejectSuggestion(entry)}
                  title="Rejeter la suggestion"
                >
                  ❌ Rejeter
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ocr-viewer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 100%;
    margin: 0 auto;
  }

  .ocr-text-container {
    width: 100%;
  }

  .ocr-textarea {
    width: 100%;
    min-height: 200px;
    padding: 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    font-family: 'Courier New', monospace;
    line-height: 1.5;
    resize: vertical;
    transition: border-color 0.2s;
  }

  .ocr-textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .suggestions-panel {
    background-color: #f8fafc;
    border-radius: 0.5rem;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .suggestions-header {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: #e0f2fe;
    cursor: pointer;
    user-select: none;
  }

  .suggestions-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #0369a1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge {
    background-color: #38bdf8;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    margin-left: 0.5rem;
  }

  .toggle-icon {
    margin-left: auto;
    font-size: 0.875rem;
    color: #64748b;
  }

  .suggestions-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .suggestion-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e2e8f0;
    transition: background-color 0.2s;
  }

  .suggestion-item:last-child {
    border-bottom: none;
  }

  .suggestion-item:hover {
    background-color: #f1f5f9;
  }

  .suggestion-text {
    flex: 1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    font-size: 0.9375rem;
  }

  .original {
    color: #ef4444;
    text-decoration: line-through;
    background-color: #fee2e2;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
  }

  .arrow {
    color: #64748b;
  }

  .corrected {
    color: #22c55e;
    font-weight: 500;
    background-color: #dcfce7;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
  }

  .confidence {
    font-size: 0.75rem;
    color: #64748b;
    margin-left: 0.5rem;
  }

  .suggestion-actions {
    display: flex;
    gap: 0.5rem;
    margin-left: 1rem;
  }

  .btn-apply,
  .btn-reject {
    padding: 0.25rem 0.5rem;
    border: none;
    border-radius: 0.25rem;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .btn-apply {
    background-color: #dcfce7;
    color: #166534;
  }

  .btn-apply:hover {
    background-color: #bbf7d0;
  }

  .btn-reject {
    background-color: #fee2e2;
    color: #991b1b;
  }

  .btn-reject:hover {
    background-color: #fecaca;
  }

  .suggestions-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    color: #64748b;
    font-size: 0.875rem;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid #e2e8f0;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .suggestion-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .suggestion-actions {
      margin-left: 0;
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>
