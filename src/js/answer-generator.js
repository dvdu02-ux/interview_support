/**
 * Answer Generator — streams AI-generated answers via Tauri Channel
 */

const { invoke, Channel } = window.__TAURI__.core;
import { interviewProfile } from './interview-profile.js';

class AnswerGenerator {
    constructor() {
        this.isGenerating = false;
        this.currentChannel = null;
        this.abortController = null;
    }

    /**
     * Generate answer for a question
     * @param {string} question - The question to answer
     * @param {Function} onChunk - Callback for each chunk (chunk: string) => void
     * @param {Function} onComplete - Callback when complete () => void
     * @param {Function} onError - Callback on error (error: string) => void
     * @returns {Promise<void>}
     */
    async generate(question, onChunk, onComplete, onError) {
        if (this.isGenerating) {
            throw new Error('Already generating an answer');
        }

        this.isGenerating = true;
        let fullAnswer = '';

        try {
            const profile = interviewProfile.get();
            const config = profile.ai_provider;

            // Validate config
            if (!config.base_url || !config.api_key || !config.model) {
                throw new Error('AI provider not configured');
            }

            // Generate system prompt from profile
            const systemPrompt = interviewProfile.generateSystemPrompt();

            // Create channel for streaming
            this.currentChannel = new Channel();
            
            this.currentChannel.onmessage = (chunk) => {
                if (chunk.startsWith('[ERROR]')) {
                    const errorMsg = chunk.replace('[ERROR]', '').trim();
                    this.isGenerating = false;
                    if (onError) onError(errorMsg);
                    return;
                }
                
                fullAnswer += chunk;
                if (onChunk) onChunk(chunk);
            };

            // Call Rust AI service
            await invoke('ai_generate_answer', {
                config: {
                    base_url: config.base_url,
                    api_key: config.api_key,
                    model: config.model,
                },
                systemPrompt,
                userMessage: question,
                channel: this.currentChannel,
            });

            this.isGenerating = false;
            if (onComplete) onComplete();
            
            return fullAnswer;

        } catch (err) {
            this.isGenerating = false;
            console.error('[AnswerGenerator] Error:', err);
            if (onError) onError(err.message || String(err));
            throw err;
        }
    }

    /**
     * Check if currently generating
     */
    isActive() {
        return this.isGenerating;
    }

    /**
     * Abort current generation (if supported)
     * Note: Currently streaming cannot be interrupted mid-stream
     */
    abort() {
        if (this.isGenerating) {
            console.warn('[AnswerGenerator] Abort requested but streaming cannot be interrupted');
            this.isGenerating = false;
            this.currentChannel = null;
        }
    }
}

// Singleton instance
export const answerGenerator = new AnswerGenerator();
