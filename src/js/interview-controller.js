/**
 * Interview Mode Controller — wires everything together
 *
 * Pipeline: utterance-completed (event bus) → question detection →
 * answer generation (streaming) → UI + history.
 *
 * Only active while the Interview tab is running (started = true).
 */

import { eventBus } from './event-bus.js';
import { interviewProfile } from './interview-profile.js';
import { questionDetector } from './question-detector.js';
import { answerGenerator } from './answer-generator.js';
import { interviewHistory } from './interview-history.js';

// UI states: ready | listening | detecting | generating | error
const STATUS_LABELS = {
    ready: 'Sẵn sàng',
    listening: 'Đang nghe…',
    detecting: 'Phân tích câu hỏi…',
    generating: 'Đang soạn câu trả lời…',
    error: 'Lỗi',
};

class InterviewController {
    constructor() {
        this.started = false;
        this.unsubscribe = null;
        this.els = {};
    }

    async init() {
        this.els = {
            panel: document.getElementById('interview-panel'),
            btnStart: document.getElementById('btn-interview-start'),
            btnStop: document.getElementById('btn-interview-stop'),
            status: document.getElementById('interview-status'),
            conversation: document.getElementById('interview-conversation'),
            emptyState: document.getElementById('interview-empty-state'),
            btnProfile: document.getElementById('btn-interview-profile'),
            btnHistory: document.getElementById('btn-interview-history'),
            profileEditor: document.getElementById('interview-profile-editor'),
            historyViewer: document.getElementById('interview-history-viewer'),
            historyList: document.getElementById('interview-history-list'),
        };

        await interviewProfile.init();
        await interviewHistory.init();
        this._bindEvents();
        this._setStatus('ready');
    }

    _bindEvents() {
        this.els.btnStart?.addEventListener('click', () => this.start());
        this.els.btnStop?.addEventListener('click', () => this.stop());
        this.els.btnProfile?.addEventListener('click', () => this._openProfileEditor());
        document.getElementById('btn-interview-profile-back')?.addEventListener('click', () => {
            this.els.profileEditor.style.display = 'none';
        });
        document.getElementById('btn-interview-profile-save')?.addEventListener('click', () => {
            this._saveProfileFromForm();
        });
        document.getElementById('btn-interview-profile-test')?.addEventListener('click', () => {
            this._testAIConnection();
        });
        this.els.btnHistory?.addEventListener('click', () => this._openHistoryViewer());
        document.getElementById('btn-interview-history-back')?.addEventListener('click', () => {
            this.els.historyViewer.style.display = 'none';
        });
    }

    start() {
        if (this.started) return;
        this.started = true;
        interviewHistory.createSession('Interview ' + new Date().toLocaleString('vi-VN'));
        this.unsubscribe = eventBus.on('utterance-completed', (data) => {
            this._onUtterance(data);
        });
        this.els.btnStart.style.display = 'none';
        this.els.btnStop.style.display = '';
        this._setStatus('listening');
        // Interview mode has no audio capture of its own — it listens to the
        // translation pipeline. Ask the app to start the engine if idle.
        eventBus.emit('interview-start-requested');
    }

    stop() {
        if (!this.started) return;
        this.started = false;
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        interviewHistory.endSession();
        this.els.btnStart.style.display = '';
        this.els.btnStop.style.display = 'none';
        this._setStatus('ready');
    }

    async _onUtterance(data) {
        if (!this.started || this._processing) return;
        const text = (data.source || data.translated || '').trim();
        if (!text) return;
        this._processing = true;
        this._setStatus('detecting');
        try {
            const result = await questionDetector.detect(text);
            if (!result.isQuestion) {
                this._setStatus('listening');
                return;
            }
            await this._answerQuestion(text);
        } catch (err) {
            console.error('[InterviewController] Utterance error:', err);
            this._setStatus('error');
            setTimeout(() => this.started && this._setStatus('listening'), 3000);
        } finally {
            this._processing = false;
        }
    }

    async _answerQuestion(question) {
        this._setStatus('generating');
        this._hideEmptyState();
        const qaEl = document.createElement('div');
        qaEl.className = 'interview-qa';
        qaEl.innerHTML = '<div class="interview-question"><div class="qa-label">Câu hỏi</div><div class="qa-text"></div></div><div class="interview-answer streaming"><div class="qa-label">Gợi ý trả lời</div><div class="qa-text"></div></div>';
        qaEl.querySelector('.interview-question .qa-text').textContent = question;
        this.els.conversation.appendChild(qaEl);
        this._scrollToBottom();
        const answerTextEl = qaEl.querySelector('.interview-answer .qa-text');
        const answerCard = qaEl.querySelector('.interview-answer');
        let fullAnswer = '';
        try {
            await answerGenerator.generate(
                question,
                (chunk) => {
                    fullAnswer += chunk;
                    answerTextEl.textContent = fullAnswer;
                    this._scrollToBottom();
                },
                () => {
                    answerCard.classList.remove('streaming');
                    interviewHistory.addConversation(question, fullAnswer);
                    if (this.started) this._setStatus('listening');
                },
                (errMsg) => {
                    answerCard.classList.remove('streaming');
                    answerTextEl.textContent = fullAnswer || ('⚠ ' + errMsg);
                    this._setStatus('error');
                    setTimeout(() => this.started && this._setStatus('listening'), 3000);
                }
            );
        } catch (err) {
            answerCard.classList.remove('streaming');
            if (!answerTextEl.textContent) {
                answerTextEl.textContent = '⚠ ' + (err.message || err);
            }
            this._setStatus('error');
            setTimeout(() => this.started && this._setStatus('listening'), 3000);
        }
    }

    _openProfileEditor() {
        const p = interviewProfile.get();
        const g = (id) => document.getElementById(id);
        g('ip-base-url').value = p.ai_provider.base_url || '';
        g('ip-api-key').value = p.ai_provider.api_key || '';
        g('ip-model').value = p.ai_provider.model || '';
        g('ip-name').value = p.personal_info.name || '';
        g('ip-role').value = p.personal_info.current_role || '';
        g('ip-years').value = p.personal_info.years_of_experience || 0;
        g('ip-education').value = p.personal_info.education || '';
        g('ip-summary').value = p.resume_context.career_summary || '';
        g('ip-skills').value = (p.resume_context.skills || []).join(', ');
        g('ip-projects').value = (p.resume_context.key_projects || []).join('\n');
        g('ip-tone').value = p.answer_settings.tone || 'professional';
        g('ip-max-length').value = p.answer_settings.max_length || 150;
        this.els.profileEditor.style.display = '';
    }

    async _saveProfileFromForm() {
        const g = (id) => document.getElementById(id);
        try {
            await interviewProfile.save({
                ai_provider: {
                    base_url: g('ip-base-url').value.trim(),
                    api_key: g('ip-api-key').value.trim(),
                    model: g('ip-model').value.trim(),
                },
                personal_info: {
                    ...interviewProfile.get().personal_info,
                    name: g('ip-name').value.trim(),
                    current_role: g('ip-role').value.trim(),
                    years_of_experience: parseInt(g('ip-years').value, 10) || 0,
                    education: g('ip-education').value.trim(),
                },
                resume_context: {
                    ...interviewProfile.get().resume_context,
                    career_summary: g('ip-summary').value.trim(),
                    skills: g('ip-skills').value.split(',').map(s => s.trim()).filter(Boolean),
                    key_projects: g('ip-projects').value.split('\n').map(s => s.trim()).filter(Boolean),
                },
                answer_settings: {
                    ...interviewProfile.get().answer_settings,
                    tone: g('ip-tone').value,
                    max_length: parseInt(g('ip-max-length').value, 10) || 150,
                },
            });
            this.els.profileEditor.style.display = 'none';
        } catch (err) {
            console.error('[InterviewController] Profile save error:', err);
            alert('Lưu hồ sơ thất bại: ' + (err.message || err));
        }
    }

    _openHistoryViewer() {
        this._renderHistoryList();
        this.els.historyViewer.style.display = '';
    }

    async _testAIConnection() {
        const g = (id) => document.getElementById(id);
        const resultEl = g('ip-test-result');
        const btn = g('btn-interview-profile-test');
        const base_url = g('ip-base-url').value.trim();
        const api_key = g('ip-api-key').value.trim();
        const model = g('ip-model').value.trim();
        if (!base_url || !api_key || !model) {
            resultEl.textContent = '⚠ Điền đủ Base URL, API Key và Model';
            resultEl.style.color = 'var(--color-warning, orange)';
            return;
        }
        btn.disabled = true;
        resultEl.textContent = '⏳ Đang kiểm tra…';
        resultEl.style.color = '';
        try {
            const { invoke } = window.__TAURI__.core;
            const ok = await Promise.race([
                invoke('ai_detect_question', { config: { base_url, api_key, model }, text: 'Hello?' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 10s')), 10000)),
            ]);
            resultEl.textContent = '✅ Kết nối thành công';
            resultEl.style.color = 'var(--color-success, #4caf50)';
        } catch (err) {
            resultEl.textContent = '❌ ' + (err.message || err);
            resultEl.style.color = 'var(--color-error, #f44336)';
        } finally {
            btn.disabled = false;
        }
    }

    _renderHistoryList() {
        const sessions = interviewHistory.listSessions();
        this.els.historyList.innerHTML = '';
        if (sessions.length === 0) {
            this.els.historyList.innerHTML = '<div class="interview-empty-state"><p>Chưa có phiên phỏng vấn nào.</p></div>';
            return;
        }
        sessions.forEach((session) => {
            const item = document.createElement('div');
            item.className = 'interview-history-item';
            const title = document.createElement('div');
            title.className = 'title';
            title.textContent = session.title;
            const meta = document.createElement('div');
            meta.className = 'meta';
            const count = session.conversations.length;
            meta.textContent = new Date(session.created_at).toLocaleString('vi-VN') + ' · ' + count + ' câu hỏi';
            const actions = document.createElement('div');
            actions.className = 'actions';
            const btnExport = document.createElement('button');
            btnExport.className = 'read-btn';
            btnExport.textContent = '📋 Copy';
            btnExport.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = interviewHistory.exportSession(session.id);
                if (text) navigator.clipboard.writeText(text);
            });
            const btnDelete = document.createElement('button');
            btnDelete.className = 'read-btn';
            btnDelete.textContent = '🗑 Xoá';
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Xoá phiên "' + session.title + '"?')) {
                    interviewHistory.deleteSession(session.id);
                    this._renderHistoryList();
                }
            });
            actions.appendChild(btnExport);
            actions.appendChild(btnDelete);
            item.appendChild(title);
            item.appendChild(meta);
            item.appendChild(actions);
            this.els.historyList.appendChild(item);
        });
    }

    _setStatus(state) {
        if (!this.els.status) return;
        this.els.status.textContent = STATUS_LABELS[state] || state;
        this.els.status.className = 'interview-status ' + state;
    }

    _hideEmptyState() {
        if (this.els.emptyState) this.els.emptyState.style.display = 'none';
    }

    _scrollToBottom() {
        this.els.conversation.scrollTop = this.els.conversation.scrollHeight;
    }
}

export const interviewController = new InterviewController();
