import { v4 as uuidv4 } from 'uuid';
import { realtimeBridge } from '../realtime/RealtimeBridge';
import { userReputationManager } from '../reputation/UserReputation';
import { cartoValidator } from '../validation/CartoValidator';
import { auditLog } from '../audit/FusionAuditLog';

type SuggestionContext = {
  missionId: string;
  userId: string;
  featureId: string;
  currentState: any;
  historicalData?: any[];
  userReputation?: number;
  similarValidations?: any[];
  relatedConflicts?: any[];
};

type Suggestion = {
  id: string;
  type: 'correction' | 'addition' | 'removal' | 'enhancement';
  description: string;
  confidence: number; // 0-1
  impact: 'low' | 'medium' | 'high';
  suggestedChange: any;
  justification: string;
  references?: Array<{
    type: 'validation' | 'conflict' | 'reputation' | 'regulation';
    id: string;
    relevance: number;
  }>;
  metadata?: Record<string, any>;
};

type SuggestionFeedback = {
  userId: string;
  suggestionId: string;
  isHelpful: boolean;
  comment?: string;
  alternativeSuggestion?: Partial<Suggestion>;
};

export class LLMAssistantV2 {
  private static instance: LLMAssistantV2;
  private readonly MIN_CONFIDENCE = 0.7;
  private readonly REPUTATION_WEIGHT = 0.3;
  private readonly CONTEXT_WEIGHT = 0.5;
  private readonly HISTORY_WEIGHT = 0.2;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): LLMAssistantV2 {
    if (!LLMAssistantV2.instance) {
      LLMAssistantV2.instance = new LLMAssistantV2();
    }
    return LLMAssistantV2.instance;
  }

  /**
   * Generate a contextual suggestion based on the current state and historical data
   */
  public async suggestCorrection(context: SuggestionContext): Promise<Suggestion> {
    const suggestionId = uuidv4();
    const timestamp = Date.now();

    // Enrich context with additional data
    const enrichedContext = await this.enrichContext(context);
    
    // Generate suggestion using the enriched context
    const suggestion = await this.generateSuggestion(enrichedContext, suggestionId);
    
    // Log the interaction
    await this.logInteraction({
      type: 'suggestion_generated',
      userId: context.userId,
      missionId: context.missionId,
      entityId: context.featureId,
      suggestionId,
      context: this.sanitizeContext(enrichedContext),
      suggestion,
      timestamp
    });

    // Broadcast the suggestion in real-time
    realtimeBridge.broadcast('suggestion', {
      type: 'new_suggestion',
      suggestion: {
        ...suggestion,
        // Don't send full context to clients
        context: { missionId: context.missionId, featureId: context.featureId }
      }
    }, context.missionId, context.userId);

    return suggestion;
  }

  /**
   * Explain why a decision was made (approval/rejection of a suggestion)
   */
  public async explainDecision(decision: {
    suggestionId: string;
    action: 'approved' | 'rejected' | 'modified';
    userId: string;
    missionId: string;
    featureId: string;
    comment?: string;
    modifiedSuggestion?: Partial<Suggestion>;
  }): Promise<{ explanation: string; confidence: number; supportingEvidence: any[] }> {
    // Get the original suggestion
    const suggestion = await this.getSuggestion(decision.suggestionId);
    
    // Get relevant context
    const context = await this.getDecisionContext({
      suggestionId: decision.suggestionId,
      userId: decision.userId,
      missionId: decision.missionId,
      featureId: decision.featureId
    });

    // Generate explanation
    const explanation = await this.generateExplanation(decision, suggestion, context);

    // Log the explanation
    await this.logInteraction({
      type: 'explanation_generated',
      userId: decision.userId,
      missionId: decision.missionId,
      entityId: decision.featureId,
      suggestionId: decision.suggestionId,
      decision,
      explanation,
      timestamp: Date.now()
    });

    return explanation;
  }

  /**
   * Refine a suggestion based on feedback or new data
   */
  public async refineSuggestion(feedback: SuggestionFeedback): Promise<Suggestion | null> {
    const originalSuggestion = await this.getSuggestion(feedback.suggestionId);
    
    if (!originalSuggestion) {
      throw new Error('Suggestion not found');
    }

    // Get user reputation to weight the feedback
    const userReputation = await userReputationManager.getUserReputation(feedback.userId);
    const reputationWeight = userReputation ? userReputation.score / 100 : 0.5;

    // Log the feedback
    await this.logInteraction({
      type: 'suggestion_feedback',
      userId: feedback.userId,
      suggestionId: feedback.suggestionId,
      feedback: {
        ...feedback,
        userReputation: userReputation?.score,
        reputationWeight
      },
      timestamp: Date.now()
    });

    // If the user provided an alternative suggestion and has high reputation
    if (feedback.alternativeSuggestion && reputationWeight > 0.7) {
      const refinedSuggestion: Suggestion = {
        ...originalSuggestion,
        ...feedback.alternativeSuggestion,
        id: uuidv4(),
        justification: `Refined based on feedback from user ${feedback.userId}. ` +
                      `Original suggestion: ${originalSuggestion.id}`,
        metadata: {
          ...originalSuggestion.metadata,
          refinedFrom: originalSuggestion.id,
          refinedBy: feedback.userId,
          refinementTimestamp: Date.now()
        }
      };

      // Log the refined suggestion
      await this.logInteraction({
        type: 'suggestion_refined',
        userId: feedback.userId,
        originalSuggestionId: originalSuggestion.id,
        refinedSuggestionId: refinedSuggestion.id,
        changes: Object.keys(feedback.alternativeSuggestion),
        timestamp: Date.now()
      });

      return refinedSuggestion;
    }

    return null;
  }

  /**
   * Stream suggestions in real-time as they're generated
   */
  public streamSuggestions(context: SuggestionContext): AsyncGenerator<Suggestion> {
    const streamId = uuidv4();
    let isActive = true;

    // Start async generation
    this.generateSuggestionsStream(context, streamId, isActive);

    // Return async generator for the client to consume
    return this.createSuggestionStream(streamId, isActive);
  }

  // Private helper methods

  private async enrichContext(context: SuggestionContext): Promise<SuggestionContext> {
    // Get user reputation
    const reputation = await userReputationManager.getUserReputation(context.userId);
    
    // Get similar validations
    const similarValidations = await cartoValidator.getFeatureHistory(context.featureId);
    
    // Get related conflicts
    const conflicts = await cartoValidator.getConflicts(context.missionId, 'open');
    const relatedConflicts = conflicts.filter(c => 
      c.conflictingActions.some(ca => 
        ca.userId === context.userId || 
        similarValidations.some(v => v.userId === ca.userId)
      )
    );

    return {
      ...context,
      userReputation: reputation?.score,
      similarValidations,
      relatedConflicts
    };
  }

  private async generateSuggestion(context: SuggestionContext, suggestionId: string): Promise<Suggestion> {
    // In a real implementation, this would call an LLM API
    // For now, we'll return a mock suggestion
    const suggestion: Suggestion = {
      id: suggestionId,
      type: 'correction',
      description: 'Suggested coordinate adjustment based on historical validation patterns',
      confidence: 0.85,
      impact: 'medium',
      suggestedChange: {
        type: 'coordinate_adjustment',
        adjustments: [
          { coordinate: 'latitude', delta: 0.0001 },
          { coordinate: 'longitude', delta: -0.0002 }
        ]
      },
      justification: 'This adjustment aligns with 87% of similar validations in this area',
      references: [
        { type: 'validation', id: 'val-123', relevance: 0.92 },
        { type: 'regulation', id: 'reg-gps-accuracy', relevance: 0.88 }
      ],
      metadata: {
        generatedAt: new Date().toISOString(),
        modelVersion: '1.0.0',
        contextSummary: `User reputation: ${context.userReputation || 'unknown'}, ` +
                      `Similar validations: ${context.similarValidations?.length || 0}, ` +
                      `Related conflicts: ${context.relatedConflicts?.length || 0}`
      }
    };

    return suggestion;
  }

  private async generateExplanation(
    decision: any,
    suggestion: Suggestion,
    context: any
  ): Promise<{ explanation: string; confidence: number; supportingEvidence: any[] }> {
    // In a real implementation, this would generate an explanation using an LLM
    return {
      explanation: `The suggestion was ${decision.action} because it ${this.getDecisionRationale(decision, suggestion, context)}.`,
      confidence: 0.92,
      supportingEvidence: [
        { type: 'validation', id: 'val-123', relevance: 0.92 },
        { type: 'user_reputation', id: `user-${decision.userId}`, relevance: 0.88 }
      ]
    };
  }

  private getDecisionRationale(decision: any, suggestion: Suggestion, context: any): string {
    // Simple heuristic for demonstration
    if (decision.action === 'approved') {
      return 'aligns with the majority of historical validations and meets the required confidence threshold';
    } else if (decision.action === 'rejected') {
      return 'conflicts with established validation patterns in this area';
    } else {
      return 'was modified to better fit the validation guidelines';
    }
  }

  private async *generateSuggestionsStream(
    context: SuggestionContext, 
    streamId: string, 
    isActive: { value: boolean }
  ) {
    try {
      // Generate multiple suggestions with increasing specificity
      const suggestions = [
        await this.suggestCorrection(context),
        // Additional suggestions would be generated here
      ];

      for (const suggestion of suggestions) {
        if (!isActive) break;
        
        // Broadcast each suggestion
        realtimeBridge.broadcast('suggestion_stream', {
          streamId,
          type: 'suggestion',
          suggestion,
          isComplete: false
        }, context.missionId, context.userId);

        yield suggestion;
      }

      // Mark stream as complete
      realtimeBridge.broadcast('suggestion_stream', {
        streamId,
        type: 'complete',
        isComplete: true
      }, context.missionId, context.userId);
    } catch (error) {
      realtimeBridge.broadcast('suggestion_stream', {
        streamId,
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        isComplete: true
      }, context.missionId, context.userId);
    }
  }

  private async *createSuggestionStream(
    streamId: string,
    isActive: { value: boolean }
  ): AsyncGenerator<Suggestion> {
    const queue: Suggestion[] = [];
    let resolve: ((value: Suggestion | PromiseLike<Suggestion>) => void) | null = null;
    let reject: ((reason?: any) => void) | null = null;
    let isComplete = false;

    // Subscribe to real-time updates
    const unsubscribe = realtimeBridge.subscribe(
      'suggestion_stream',
      'llm_assistant',
      (message: any) => {
        if (message.streamId !== streamId) return;

        if (message.type === 'suggestion') {
          queue.push(message.suggestion);
          if (resolve) {
            resolve(queue.shift()!);
            resolve = null;
          }
        } else if (message.type === 'complete' || message.type === 'error') {
          isComplete = true;
          if (message.type === 'error' && reject) {
            reject(new Error(message.error));
          } else if (resolve) {
            resolve(queue.shift()!);
          }
          unsubscribe();
        }
      }
    );

    // Cleanup function
    const cleanup = () => {
      isActive = false;
      unsubscribe();
      if (reject) {
        reject(new Error('Stream was cancelled'));
      }
    };

    try {
      // Yield suggestions as they arrive
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else if (isComplete) {
          break;
        } else {
          yield new Promise<Suggestion>((res, rej) => {
            resolve = res;
            reject = rej;
          });
        }
      }
    } finally {
      cleanup();
    }
  }

  private async getSuggestion(suggestionId: string): Promise<Suggestion | null> {
    // In a real implementation, this would fetch the suggestion from a database
    // For now, we'll return a mock
    return {
      id: suggestionId,
      type: 'correction',
      description: 'Mock suggestion',
      confidence: 0.85,
      impact: 'medium',
      suggestedChange: {},
      justification: 'Mock justification'
    };
  }

  private async getDecisionContext(params: {
    suggestionId: string;
    userId: string;
    missionId: string;
    featureId: string;
  }) {
    // In a real implementation, this would fetch relevant context
    return {
      suggestion: await this.getSuggestion(params.suggestionId),
      userReputation: await userReputationManager.getUserReputation(params.userId),
      featureHistory: await cartoValidator.getFeatureHistory(params.featureId),
      missionStats: cartoValidator.getStats(params.missionId)
    };
  }

  private async logInteraction(data: {
    type: string;
    userId: string;
    missionId?: string;
    entityId?: string;
    suggestionId?: string;
    [key: string]: any;
  }) {
    const { type, userId, missionId, entityId, suggestionId, ...payload } = data;
    
    return auditLog.record('ai_interaction', userId, {
      interactionType: type,
      suggestionId,
      ...payload
    }, { 
      missionId, 
      entityType: 'suggestion', 
      entityId: suggestionId || entityId 
    });
  }

  private sanitizeContext(context: any): any {
    // Remove any sensitive or large data from context before logging
    const { currentState, historicalData, ...rest } = context;
    return {
      ...rest,
      currentState: currentState ? '[REDACTED]' : undefined,
      historicalData: historicalData ? `[${historicalData.length} items]` : undefined
    };
  }

  private setupEventListeners() {
    // Listen for validation events to improve suggestions
    realtimeBridge.subscribe('validation', 'llm_assistant', async (event) => {
      if (event.type === 'action_recorded' && event.record) {
        // Update internal models based on validation outcomes
        await this.logInteraction({
          type: 'validation_observed',
          userId: event.record.userId,
          missionId: event.record.missionId,
          entityId: event.record.featureId,
          suggestionId: event.record.suggestionId,
          action: event.record.action,
          timestamp: event.record.timestamp
        });
      }
    });
  }
}

export const llmAssistant = LLMAssistantV2.getInstance();

export type { Suggestion, SuggestionContext, SuggestionFeedback };
