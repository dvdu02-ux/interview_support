/**
 * Interview History — CRUD for interview sessions
 * Stores conversations (question + answer pairs) in memory and localStorage
 */

class InterviewHistory {
    constructor() {
        this.sessions = []; // Array of Session objects
        this.currentSession = null;
        this.storageKey = 'interview_sessions';
        this._listeners = [];
    }

    /**
     * Initialize history from localStorage
     */
    async init() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.sessions = JSON.parse(stored);
            }
        } catch (err) {
            console.error('[InterviewHistory] Init error:', err);
            this.sessions = [];
        }
        return this.sessions;
    }

    /**
     * Create new session
     * @param {string} title - Session title
     * @returns {Session}
     */
    createSession(title = 'Untitled Interview') {
        const session = {
            id: this._generateId(),
            title,
            created_at: new Date().toISOString(),
            ended_at: null,
            conversations: [], // Array of { question, answer, timestamp }
        };
        
        this.sessions.unshift(session); // Add to beginning
        this.currentSession = session;
        this._save();
        this._notify();
        
        return session;
    }

    /**
     * Get current session (or create if none)
     */
    getCurrentSession() {
        if (!this.currentSession) {
            this.currentSession = this.createSession();
        }
        return this.currentSession;
    }

    /**
     * Add conversation to current session
     * @param {string} question
     * @param {string} answer
     */
    addConversation(question, answer) {
        const session = this.getCurrentSession();
        session.conversations.push({
            question,
            answer,
            timestamp: new Date().toISOString(),
        });
        this._save();
        this._notify();
    }

    /**
     * End current session
     */
    endSession() {
        if (this.currentSession) {
            this.currentSession.ended_at = new Date().toISOString();
            this._save();
            this._notify();
            this.currentSession = null;
        }
    }

    /**
     * Get session by ID
     */
    getSession(id) {
        return this.sessions.find(s => s.id === id);
    }

    /**
     * List all sessions
     */
    listSessions() {
        return [...this.sessions];
    }

    /**
     * Update session title
     */
    updateSessionTitle(id, title) {
        const session = this.getSession(id);
        if (session) {
            session.title = title;
            this._save();
            this._notify();
        }
    }

    /**
     * Delete session
     */
    deleteSession(id) {
        const index = this.sessions.findIndex(s => s.id === id);
        if (index > -1) {
            this.sessions.splice(index, 1);
            if (this.currentSession?.id === id) {
                this.currentSession = null;
            }
            this._save();
            this._notify();
        }
    }

    /**
     * Clear all sessions
     */
    clearAll() {
        this.sessions = [];
        this.currentSession = null;
        this._save();
        this._notify();
    }

    /**
     * Export session as text
     */
    exportSession(id) {
        const session = this.getSession(id);
        if (!session) return null;

        let text = `# ${session.title}\n`;
        text += `Created: ${new Date(session.created_at).toLocaleString()}\n`;
        if (session.ended_at) {
            text += `Ended: ${new Date(session.ended_at).toLocaleString()}\n`;
        }
        text += `\n---\n\n`;

        session.conversations.forEach((conv, i) => {
            text += `## Q${i + 1}: ${conv.question}\n\n`;
            text += `**A:** ${conv.answer}\n\n`;
            text += `*${new Date(conv.timestamp).toLocaleString()}*\n\n`;
            text += `---\n\n`;
        });

        return text;
    }

    /**
     * Subscribe to history changes
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
     * Generate unique ID
     */
    _generateId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Save to localStorage
     */
    _save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.sessions));
        } catch (err) {
            console.error('[InterviewHistory] Save error:', err);
        }
    }

    /**
     * Notify listeners
     */
    _notify() {
        this._listeners.forEach(callback => {
            try {
                callback(this.sessions);
            } catch (err) {
                console.error('[InterviewHistory] Listener error:', err);
            }
        });
    }
}

// Singleton instance
export const interviewHistory = new InterviewHistory();
