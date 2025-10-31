import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabase';
import type { CorrectionEntry, CorrectionFilter, CorrectionStats } from './types';

const STORAGE_KEY = 'ocr_corrections';
const LOCAL_STORAGE_KEY = `local_${STORAGE_KEY}`;

export class OCRCorrectionMemory {
  private static instance: OCRCorrectionMemory;
  private corrections: Map<string, CorrectionEntry> = new Map();
  private isInitialized = false;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): OCRCorrectionMemory {
    if (!OCRCorrectionMemory.instance) {
      OCRCorrectionMemory.instance = new OCRCorrectionMemory();
    }
    return OCRCorrectionMemory.instance;
  }

  private async initialize() {
    if (this.isInitialized) return;

    try {
      // Try to load from database first
      const { data, error } = await supabase
        .from('ocr_corrections')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        data.forEach(correction => {
          this.corrections.set(correction.id, {
            ...correction,
            createdAt: correction.created_at,
            updatedAt: correction.updated_at,
            lastAppliedAt: correction.last_applied_at,
            lastRejectedAt: correction.last_rejected_at,
            appliedCount: correction.applied_count || 0,
            rejectedCount: correction.rejected_count || 0,
          });
        });
      } else {
        // Fallback to localStorage if database fails
        this.loadFromLocalStorage();
      }
    } catch (error) {
      console.error('Failed to initialize OCR corrections from database:', error);
      this.loadFromLocalStorage();
    }

    this.isInitialized = true;
  }

  private loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.corrections = new Map(parsed);
      }
    } catch (error) {
      console.error('Failed to load corrections from localStorage:', error);
    }
  }

  private async persistToDatabase(entry: CorrectionEntry) {
    try {
      const { error } = await supabase
        .from('ocr_corrections')
        .upsert(
          {
            id: entry.id,
            original: entry.original,
            corrected: entry.corrected,
            source: entry.source,
            confidence: entry.confidence,
            context: entry.context,
            applied_count: entry.appliedCount,
            rejected_count: entry.rejectedCount,
            last_applied_at: entry.lastAppliedAt,
            last_rejected_at: entry.lastRejectedAt,
            metadata: entry.metadata,
            updated_at: new Date().toISOString(),
            ...(entry.createdAt ? {} : { created_at: new Date().toISOString() }),
          },
          { onConflict: 'id' }
        );

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Failed to persist correction to database:', error);
      this.persistToLocalStorage();
      return false;
    }
  }

  private persistToLocalStorage() {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify(Array.from(this.corrections.entries()))
      );
      return true;
    } catch (error) {
      console.error('Failed to persist corrections to localStorage:', error);
      return false;
    }
  }

  public async addCorrection(entry: Omit<CorrectionEntry, 'id' | 'createdAt' | 'updatedAt' | 'appliedCount' | 'rejectedCount'>): Promise<CorrectionEntry> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const newEntry: CorrectionEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
      appliedCount: 0,
      rejectedCount: 0,
    };

    this.corrections.set(id, newEntry);
    await this.persistToDatabase(newEntry);
    return newEntry;
  }

  public async updateCorrection(id: string, updates: Partial<CorrectionEntry>): Promise<CorrectionEntry | null> {
    const existing = this.corrections.get(id);
    if (!existing) return null;

    const updatedEntry: CorrectionEntry = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.corrections.set(id, updatedEntry);
    await this.persistToDatabase(updatedEntry);
    return updatedEntry;
  }

  public async deleteCorrection(id: string): Promise<boolean> {
    if (!this.corrections.has(id)) return false;

    try {
      const { error } = await supabase
        .from('ocr_corrections')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      this.corrections.delete(id);
      this.persistToLocalStorage();
      return true;
    } catch (error) {
      console.error('Failed to delete correction:', error);
      return false;
    }
  }

  public async getSuggestions(text: string, options: { minConfidence?: number } = {}): Promise<CorrectionEntry[]> {
    if (!text.trim()) return [];
    
    const { minConfidence = 0.5 } = options;
    const suggestions: CorrectionEntry[] = [];
    const words = text.split(/\s+/);
    
    for (const entry of this.corrections.values()) {
      if (entry.confidence < minConfidence) continue;
      
      // Simple word-based matching (could be enhanced with more sophisticated matching)
      const hasMatch = words.some(word => 
        word.toLowerCase() === entry.original.toLowerCase()
      );
      
      if (hasMatch) {
        suggestions.push(entry);
      }
    }
    
    // Sort by confidence (highest first) then by appliedCount (most used first)
    return suggestions.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      return b.appliedCount - a.appliedCount;
    });
  }

  public async recordApplied(id: string): Promise<CorrectionEntry | null> {
    const entry = this.corrections.get(id);
    if (!entry) return null;

    const now = new Date().toISOString();
    const updatedEntry: CorrectionEntry = {
      ...entry,
      appliedCount: (entry.appliedCount || 0) + 1,
      lastAppliedAt: now,
      updatedAt: now,
    };

    this.corrections.set(id, updatedEntry);
    await this.persistToDatabase(updatedEntry);
    return updatedEntry;
  }

  public async recordRejected(id: string): Promise<CorrectionEntry | null> {
    const entry = this.corrections.get(id);
    if (!entry) return null;

    const now = new Date().toISOString();
    const updatedEntry: CorrectionEntry = {
      ...entry,
      rejectedCount: (entry.rejectedCount || 0) + 1,
      lastRejectedAt: now,
      updatedAt: now,
    };

    this.corrections.set(id, updatedEntry);
    await this.persistToDatabase(updatedEntry);
    return updatedEntry;
  }

  public async getCorrections(filter: CorrectionFilter = {}): Promise<CorrectionEntry[]> {
    await this.initialize();
    
    let results = Array.from(this.corrections.values());
    
    // Apply filters
    if (filter.source && filter.source !== 'all') {
      results = results.filter(entry => entry.source === filter.source);
    }
    
    if (filter.searchTerm) {
      const searchLower = filter.searchTerm.toLowerCase();
      results = results.filter(
        entry =>
          entry.original.toLowerCase().includes(searchLower) ||
          entry.corrected.toLowerCase().includes(searchLower) ||
          entry.context?.toLowerCase().includes(searchLower)
      );
    }
    
    if (filter.minConfidence !== undefined) {
      results = results.filter(entry => entry.confidence >= filter.minConfidence!);
    }
    
    if (filter.dateRange) {
      const { from, to } = filter.dateRange;
      const fromDate = new Date(from).getTime();
      const toDate = new Date(to).getTime();
      
      results = results.filter(entry => {
        const entryDate = new Date(entry.updatedAt).getTime();
        return entryDate >= fromDate && entryDate <= toDate;
      });
    }
    
    return results.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public async getStats(): Promise<CorrectionStats> {
    await this.initialize();
    
    const entries = Array.from(this.corrections.values());
    const now = new Date().toISOString();
    
    const bySource = {
      user: entries.filter(e => e.source === 'user').length,
      agent: entries.filter(e => e.source === 'agent').length,
      external: entries.filter(e => e.source === 'external').length,
      history: entries.filter(e => e.source === 'history').length,
    };
    
    const totalConfidence = entries.reduce((sum, e) => sum + e.confidence, 0);
    const averageConfidence = entries.length > 0 ? totalConfidence / entries.length : 0;
    
    return {
      total: entries.length,
      bySource,
      averageConfidence,
      lastUpdated: now,
    };
  }

  public async exportCorrections(): Promise<string> {
    await this.initialize();
    return JSON.stringify(Array.from(this.corrections.values()), null, 2);
  }

  public async importCorrections(json: string): Promise<{ success: boolean; count: number; errors: string[] }> {
    try {
      const data = JSON.parse(json);
      const entries: CorrectionEntry[] = Array.isArray(data) ? data : [data];
      const errors: string[] = [];
      let importedCount = 0;

      for (const entry of entries) {
        try {
          // Validate required fields
          if (!entry.original || !entry.corrected || !entry.source) {
            throw new Error('Missing required fields');
          }

          // Create a new entry with the data
          await this.addCorrection({
            original: entry.original,
            corrected: entry.corrected,
            source: entry.source,
            confidence: entry.confidence || 0.8,
            context: entry.context,
            metadata: entry.metadata,
          });
          
          importedCount++;
        } catch (error) {
          errors.push(`Failed to import entry: ${error.message}`);
        }
      }

      return {
        success: errors.length === 0,
        count: importedCount,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        errors: [`Failed to parse JSON: ${error.message}`],
      };
    }
  }
}

// Export a singleton instance
export const ocrCorrectionMemory = OCRCorrectionMemory.getInstance();

// Export types
export type { CorrectionEntry, CorrectionFilter, CorrectionStats } from './types';
