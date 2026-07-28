/**
 * Interview Profile Manager — handles interview profile configuration
 * Stores: AI provider config, personal info, resume context
 */

const { invoke } = window.__TAURI__.core;

// Default interview profile
const DEFAULT_PROFILE = {
    // AI Provider config
    ai_provider: {
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        model: 'gpt-4o-mini',
    },
    
    // Personal information
    personal_info: {
        name: '',
        current_role: '',
        years_of_experience: 0,
        education: '',
        location: '',
    },
    
    // Resume context (used in answer generation system prompt)
    resume_context: {
        skills: [],
        key_projects: [],
        achievements: [],
        career_summary: '',
    },
    
    // Answer generation settings
    answer_settings: {
        tone: 'professional', // professional | casual | technical
        max_length: 150, // words
        include_examples: true,
    },
};

class InterviewProfileManager {
    constructor() {
        this.profile = { ...DEFAULT_PROFILE };
        this._listeners = [];
    }

    /**
     * Initialize and load profile
     */
    async init() {
        try {
            const content = await invoke('load_interview_profile');
            if (content) {
                const loaded = JSON.parse(content);
                this.profile = { ...DEFAULT_PROFILE, ...loaded };
            } else {
                // No profile exists yet, save default
                await this.save(this.profile);
            }
        } catch (err) {
            console.error('[InterviewProfile] Init error:', err);
            this.profile = { ...DEFAULT_PROFILE };
        }
        
        return this.profile;
    }

    /**
     * Load profile from disk
     */
    async load() {
        try {
            const content = await invoke('load_interview_profile');
            if (content) {
                const loaded = JSON.parse(content);
                this.profile = { ...DEFAULT_PROFILE, ...loaded };
                this._notify();
            }
            return this.profile;
        } catch (err) {
            console.error('[InterviewProfile] Load error:', err);
            throw err;
        }
    }

    /**
     * Save profile to disk
     */
    async save(updates) {
        try {
            this.profile = { ...this.profile, ...updates };
            const content = JSON.stringify(this.profile, null, 2);
            await invoke('save_interview_profile', { content });
            this._notify();
            return true;
        } catch (err) {
            console.error('[InterviewProfile] Save error:', err);
            throw err;
        }
    }

    /**
     * Get current profile
     */
    get() {
        return { ...this.profile };
    }

    /**
     * Update AI provider config
     */
    async updateAIProvider(config) {
        return this.save({
            ...this.profile,
            ai_provider: { ...this.profile.ai_provider, ...config },
        });
    }

    /**
     * Update personal info
     */
    async updatePersonalInfo(info) {
        return this.save({
            ...this.profile,
            personal_info: { ...this.profile.personal_info, ...info },
        });
    }

    /**
     * Update resume context
     */
    async updateResumeContext(context) {
        return this.save({
            ...this.profile,
            resume_context: { ...this.profile.resume_context, ...context },
        });
    }

    /**
     * Update answer settings
     */
    async updateAnswerSettings(settings) {
        return this.save({
            ...this.profile,
            answer_settings: { ...this.profile.answer_settings, ...settings },
        });
    }

    /**
     * Subscribe to profile changes
     */
    onChange(callback) {
        this._listeners.push(callback);
        return () => {
            const index = this._listeners.indexOf(callback);
            if (index > -1) {
                this._listeners.splice(index, 1);
            }
        };
    }

    /**
     * Notify all listeners
     */
    _notify() {
        this._listeners.forEach(callback => {
            try {
                callback(this.profile);
            } catch (err) {
                console.error('[InterviewProfile] Listener error:', err);
            }
        });
    }

    /**
     * Generate system prompt from profile
     */
    generateSystemPrompt() {
        const { personal_info, resume_context, answer_settings } = this.profile;
        
        let prompt = `You are an interview assistant helping ${personal_info.name || 'the candidate'}. `;
        
        if (personal_info.current_role) {
            prompt += `They are a ${personal_info.current_role} `;
        }
        
        if (personal_info.years_of_experience > 0) {
            prompt += `with ${personal_info.years_of_experience} years of experience. `;
        }
        
        if (resume_context.career_summary) {
            prompt += `\n\nCareer Summary: ${resume_context.career_summary}\n`;
        }
        
        if (resume_context.skills.length > 0) {
            prompt += `\nKey Skills: ${resume_context.skills.join(', ')}\n`;
        }
        
        if (resume_context.key_projects.length > 0) {
            prompt += `\nKey Projects: ${resume_context.key_projects.join('; ')}\n`;
        }
        
        if (resume_context.achievements.length > 0) {
            prompt += `\nAchievements: ${resume_context.achievements.join('; ')}\n`;
        }
        
        prompt += `\nGenerate answers in a ${answer_settings.tone} tone. `;
        prompt += `Keep answers concise (max ${answer_settings.max_length} words). `;
        
        if (answer_settings.include_examples) {
            prompt += `Include specific examples from their experience when relevant. `;
        }
        
        prompt += `\nProvide natural, confident responses suitable for a job interview.`;
        
        return prompt;
    }
}

// Singleton instance
export const interviewProfile = new InterviewProfileManager();
