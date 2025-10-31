import { v4 as uuidv4 } from 'uuid';
import { realtimeBridge } from '../realtime/RealtimeBridge';
import { userReputationManager } from '../reputation/UserReputation';
import { cartoValidator } from '../validation/CartoValidator';
import { auditLog } from '../audit/FusionAuditLog';

type SuggestionContext = {
  missionId: string;
  userId: string;
  featureId: string;
  currentState: Record<string, any>;
};

type Suggestion = {
  id: string;
  featureId: string;
  suggestion: any;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  explanation: string;
  timestamp: number;
};

type SuggestionFeedback = {
  suggestionId: string;
  userId: string;
  isHelpful: boolean;
  comment?: string;
  adjustment?: string;
  reason?: string;
};

type DecisionParams = {
  suggestionId: string;
  action: 'approved' | 'rejected' | 'modified';
  userId: string;
  missionId: string;
  featureId: string;
  comment?: string;
  modifiedSuggestion?: any;
};

export class LLMAssistantV2 {
  private static instance: LLMAssistantV2;
  
  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): LLMAssistantV2 {
    if (!LLMAssistantV2.instance) {
      LLMAssistantV2.instance = new LLMAssistantV2();
    }
    return LLMAssistantV2.instance;
  }

  public async suggestCorrection(ctx: SuggestionContext): Promise<Suggestion> {
    const confidence = this.estimateConfidence(ctx);
    const impact = this.assessImpact(ctx);
    const suggestion = this.generateSuggestion(ctx);
    const explanation = this.explain(suggestion, ctx);

    const result: Suggestion = {
      id: `sugg_${Date.now()}`,
      featureId: ctx.featureId,
      suggestion,
      confidence,
      impact,
      explanation,
      timestamp: Date.now()
    };

    // Log the suggestion
    auditLog.record('suggestion', ctx.userId, result, { 
      missionId: ctx.missionId,
      entityType: 'suggestion',
      entityId: result.id
    });

    return result;
  }

  public async explainDecision(params: DecisionParams): Promise<string> {
    const explanation = `La suggestion ${params.suggestionId} a été ${params.action} par ${params.userId} sur ${params.featureId}.`;
    
    // Log the decision
    auditLog.record('validation', params.userId, { 
      decision: params.action, 
      suggestionId: params.suggestionId,
      comment: params.comment
    }, { 
      missionId: params.missionId,
      entityType: 'suggestion',
      entityId: params.suggestionId
    });

    return explanation;
  }

  public async *streamSuggestions(ctx: SuggestionContext): AsyncGenerator<Suggestion> {
    // Generate 3 suggestions with increasing confidence
    for (let i = 0; i < 3; i++) {
      const suggestion = await this.suggestCorrection({
        ...ctx,
        // Add iteration context to generate different suggestions
        currentState: {
          ...ctx.currentState,
          iteration: i
        }
      });
      
      yield suggestion;
      await new Promise(r => setTimeout(r, 1000)); // Simulate processing time
    }
  }

  public processFeedback(feedback: SuggestionFeedback): void {
    auditLog.record('feedback', feedback.userId, { 
      suggestionId: feedback.suggestionId,
      isHelpful: feedback.isHelpful,
      comment: feedback.comment,
      adjustment: feedback.adjustment,
      reason: feedback.reason
    }, {
      entityType: 'suggestion',
      entityId: feedback.suggestionId
    });

    // Update user reputation based on feedback
    if (feedback.isHelpful) {
      userReputationManager.recordEvent({
        userId: feedback.userId,
        type: 'feedback',
        weight: 0.5,
        metadata: {
          suggestionId: feedback.suggestionId,
          type: 'helpful_feedback'
        }
      });
    }
  }

  // --- Internal Methods ---

  private estimateConfidence(ctx: SuggestionContext): number {
    // Simple confidence estimation based on available data
    let confidence = 0.5; // Base confidence
    
    // Increase confidence if we have historical data
    if (ctx.currentState?.historicalData?.length > 0) {
      confidence += 0.2;
    }
    
    // Increase confidence based on user reputation
    const userRep = userReputationManager.getUserReputation(ctx.userId);
    if (userRep && userRep.score > 70) {
      confidence += 0.15;
    }
    
    return Math.min(Math.max(confidence, 0), 1); // Clamp between 0 and 1
  }

  private assessImpact(ctx: SuggestionContext): 'low' | 'medium' | 'high' {
    // Simple impact assessment
    if (ctx.currentState?.criticalFeature) {
      return 'high';
    }
    return ctx.currentState?.complexity > 5 ? 'medium' : 'low';
  }

  private generateSuggestion(ctx: SuggestionContext): any {
    // Simple suggestion generation
    return { 
      type: 'correction',
      adjustment: 'shift 1.5m north',
      note: 'based on GNSS residuals and validation patterns',
      context: {
        missionId: ctx.missionId,
        featureId: ctx.featureId,
        timestamp: new Date().toISOString()
      }
    };
  }

  private explain(suggestion: any, ctx: SuggestionContext): string {
    return `La suggestion est basée sur les résidus GNSS et les validations antérieures de la mission ${ctx.missionId}.`;
  }

  private setupEventListeners(): void {
    // Listen for validation events
    realtimeBridge.subscribe('validation', 'llm_assistant', (event) => {
      if (event.type === 'validation_result' && event.suggestionId) {
        this.processFeedback({
          suggestionId: event.suggestionId,
          userId: event.userId,
          isHelpful: event.isValid,
          comment: event.comment
        });
      }
    });
  }
}

// Singleton instance
export const llmAssistant = LLMAssistantV2.getInstance();

export type { Suggestion, SuggestionContext, SuggestionFeedback, DecisionParams };
