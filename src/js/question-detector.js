/**
 * Question Detector — AI-based + rule-based fallback
 * Detects if utterance is a question that needs an answer
 */

const { invoke } = window.__TAURI__.core;
import { interviewProfile } from './interview-profile.js';

// Rule-based patterns (fallback when AI fails)
const QUESTION_PATTERNS = [
    // English
    /\b(what|where|when|why|who|how|which|whose|whom)\b/i,
    /\b(can|could|would|should|will|shall|may|might|must|do|does|did|is|are|was|were|have|has|had)\s+\w+/i,
    /\?$/,
    
    // Vietnamese
    /\b(gì|nào|đâu|sao|ai|khi nào|như thế nào|bao nhiêu|thế nào)\b/i,
    /\b(có|được|biết|hiểu|làm|là)\b.*\b(không|chưa|à)\b/i,
];

// Exclude patterns (not questions even if they match)
const EXCLUDE_PATTERNS = [
    /^(okay|ok|yes|no|yeah|sure|thanks|thank you|alright|good|great|nice|well|right)/i,
    /^(vâng|dạ|được|tốt|cảm ơn|ok|ừ)/i,
    /^(hmm|uh|um|ah|oh)/i,
];

class QuestionDetector {
    constructor() {
        this.aiEnabled = true;
        this.fallbackCount = 0;
        this.totalCount = 0;
    }

    /**
     * Detect if text is a question
     * Returns { isQuestion: boolean, method: 'ai' | 'rule' }
     */
    async detect(text) {
        if (!text || text.trim().length < 3) {
            return { isQuestion: false, method: 'rule', confidence: 1.0 };
        }

        this.totalCount++;

        // Try AI detection first
        if (this.aiEnabled) {
            try {
                const result = await this._detectWithAI(text);
                return result;
            } catch (err) {
                console.warn('[QuestionDetector] AI detection failed, using rule-based fallback:', err);
                this.fallbackCount++;
                // Continue to rule-based fallback
            }
        }

        // Fallback to rule-based
        return this._detectWithRules(text);
    }

    /**
     * AI-based detection
     */
    async _detectWithAI(text) {
        const profile = interviewProfile.get();
        const config = profile.ai_provider;

        // Validate config
        if (!config.base_url || !config.api_key || !config.model) {
            throw new Error('AI provider not configured');
        }

        const isQuestion = await invoke('ai_detect_question', {
            config: {
                base_url: config.base_url,
                api_key: config.api_key,
                model: config.model,
            },
            text,
        });

        return { isQuestion, method: 'ai', confidence: 0.9 };
    }

    /**
     * Rule-based detection (fallback)
     */
    _detectWithRules(text) {
        const trimmed = text.trim();

        // Check exclude patterns first
        for (const pattern of EXCLUDE_PATTERNS) {
            if (pattern.test(trimmed)) {
                return { isQuestion: false, method: 'rule', confidence: 0.8 };
            }
        }

        // Check question patterns
        for (const pattern of QUESTION_PATTERNS) {
            if (pattern.test(trimmed)) {
                return { isQuestion: true, method: 'rule', confidence: 0.7 };
            }
        }

        return { isQuestion: false, method: 'rule', confidence: 0.6 };
    }

    /**
     * Get detection stats
     */
    getStats() {
        return {
            total: this.totalCount,
            fallback: this.fallbackCount,
            fallbackRate: this.totalCount > 0 ? this.fallbackCount / this.totalCount : 0,
        };
    }

    /**
     * Reset stats
     */
    resetStats() {
        this.fallbackCount = 0;
        this.totalCount = 0;
    }

    /**
     * Enable/disable AI detection
     */
    setAIEnabled(enabled) {
        this.aiEnabled = enabled;
    }
}

// Singleton instance
export const questionDetector = new QuestionDetector();
