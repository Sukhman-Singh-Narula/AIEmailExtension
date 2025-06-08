import * as InboxSDK from '@inboxsdk/core';

// Utility function to retrieve data from Chrome storage
async function retrieveFromStorage(key) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(key, function (result) {
            resolve(result[key]);
        });
    });
}

// Enhanced AudioRecorder class with advanced features
class AudioRecorder {
    constructor(sdk) {
        this.sdk = sdk;
        this.recording = false;
        this.mediaRecorder = null;
        this.stream = null;
        this.token = null;
        this.chunks = [];
        this.recordingPopup = null;
        this.customizationPopup = null;
        this.currentComposeView = null;
        this.settings = {};
        this.templates = [];
        this.shortcuts = {};

        // Initialize settings and shortcuts
        this.loadUserSettings();
        this.setupKeyboardShortcuts();
    }

    // Load user settings from storage
    async loadUserSettings() {
        try {
            const result = await chrome.storage.sync.get(['user_settings', 'email_templates']);
            this.settings = result.user_settings || {};
            this.templates = result.email_templates || [];
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    // Setup keyboard shortcuts
    setupKeyboardShortcuts() {
        if (!this.settings.enableShortcuts) return;

        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+R: Start recording
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                if (this.currentComposeView && !this.recording) {
                    this.startRecording(this.currentComposeView);
                }
            }

            // Escape: Stop recording
            if (e.key === 'Escape' && this.recording) {
                e.preventDefault();
                this.stopRecording();
            }
        });
    }

    // Enhanced recording popup with more features
    createRecordingPopup() {
        const popup = document.createElement('div');
        popup.className = 'transcription-recording-popup enhanced';
        popup.innerHTML = `
            <div class="recording-header">
                <div class="recording-indicator">
                    <div class="pulse-dot"></div>
                    <span>Recording...</span>
                </div>
                <div class="recording-timer">00:00</div>
            </div>
            <div class="recording-waveform">
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
                <div class="wave-bar"></div>
            </div>
            <div class="recording-controls">
                <button class="control-btn pause-btn" id="pauseRecording" title="Pause">
                    ⏸️
                </button>
                <button class="control-btn stop-btn" id="stopRecording" title="Stop & Process">
                    <img src="${chrome.runtime.getURL("icons/stop_icon.png")}" alt="Stop">
                    Stop & Process
                </button>
            </div>
            <div class="voice-commands">
                <small>💡 Try: "Use template intro" or "Set tone formal"</small>
            </div>
            <div class="recording-tips">
                <small>Shortcut: ESC to stop • Speak clearly</small>
            </div>
        `;

        document.body.appendChild(popup);
        this.recordingPopup = popup;

        // Start timer and visual effects
        this.startTimer();
        this.startWaveformAnimation();

        // Add event listeners
        popup.querySelector('#stopRecording').addEventListener('click', () => {
            this.stopRecording();
        });

        popup.querySelector('#pauseRecording').addEventListener('click', () => {
            this.togglePause();
        });

        return popup;
    }

    // Enhanced customization popup with templates and smart suggestions
    createCustomizationPopup() {
        const popup = document.createElement('div');
        popup.className = 'transcription-customization-popup enhanced';
        popup.innerHTML = `
            <div class="customization-header">
                <h3>🎯 Customize Your Email</h3>
                <div class="processing-status">
                    <img src="${chrome.runtime.getURL("icons/status.gif")}" alt="Processing">
                    <span>Processing audio...</span>
                </div>
            </div>
            <div class="customization-form">
                <div class="quick-actions">
                    <button class="quick-btn" data-tone="professional">💼 Professional</button>
                    <button class="quick-btn" data-tone="friendly">😊 Friendly</button>
                    <button class="quick-btn" data-tone="formal">📋 Formal</button>
                    <button class="quick-btn" data-tone="casual">👋 Casual</button>
                </div>
                
                <div class="form-group">
                    <label>📧 To (optional):</label>
                    <input type="text" id="recipientName" placeholder="e.g., John, Dr. Smith, Team">
                    <div class="smart-suggestions" id="nameSuggestions"></div>
                </div>
                
                <div class="form-row">
                    <div class="form-group half">
                        <label>🎭 Tone:</label>
                        <select id="emailTone">
                            <option value="professional">Professional</option>
                            <option value="friendly">Friendly</option>
                            <option value="formal">Formal</option>
                            <option value="casual">Casual</option>
                            <option value="concise">Concise</option>
                            <option value="enthusiastic">Enthusiastic</option>
                        </select>
                    </div>
                    <div class="form-group half">
                        <label>📋 Type:</label>
                        <select id="emailType">
                            <option value="general">General</option>
                            <option value="request">Request/Ask</option>
                            <option value="follow-up">Follow-up</option>
                            <option value="thank-you">Thank You</option>
                            <option value="introduction">Introduction</option>
                            <option value="meeting">Meeting</option>
                            <option value="proposal">Proposal</option>
                        </select>
                    </div>
                </div>

                ${this.templates.length > 0 ? `
                <div class="form-group">
                    <label>📄 Apply Template:</label>
                    <select id="emailTemplate">
                        <option value="">Select a template...</option>
                        ${this.templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                    </select>
                </div>
                ` : ''}

                <div class="advanced-options" id="advancedToggle">
                    <span>⚙️ Advanced Options</span>
                    <div class="advanced-content" style="display: none;">
                        <div class="form-group">
                            <label>📝 Additional Instructions:</label>
                            <textarea id="customInstructions" placeholder="e.g., Include meeting agenda, mention deadline, use bullet points..."></textarea>
                        </div>
                        <div class="checkbox-group">
                            <label><input type="checkbox" id="includeSignature" ${this.settings.includeSignature ? 'checked' : ''}> Include signature</label>
                            <label><input type="checkbox" id="addSubject"> Suggest subject line</label>
                            <label><input type="checkbox" id="urgentFlag"> Mark as urgent</label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="customization-actions">
                <button class="cancel-btn" id="cancelCustomization">Cancel</button>
                <button class="preview-btn" id="previewEmail">👁️ Preview</button>
                <button class="process-btn" id="processWithOptions" disabled>
                    <span class="btn-text">✨ Insert Email</span>
                    <span class="btn-loading" style="display: none;">Processing...</span>
                </button>
            </div>
        `;

        document.body.appendChild(popup);
        this.customizationPopup = popup;

        // Setup event listeners
        this.setupCustomizationListeners();

        // Auto-focus recipient field if enabled
        if (this.settings.autoDetectNames) {
            this.detectAndSuggestRecipients();
        }

        // Set default tone
        if (this.settings.defaultTone) {
            popup.querySelector('#emailTone').value = this.settings.defaultTone;
        }

        return popup;
    }

    // Setup all customization popup event listeners
    setupCustomizationListeners() {
        const popup = this.customizationPopup;

        // Quick action buttons
        popup.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tone = btn.dataset.tone;
                popup.querySelector('#emailTone').value = tone;
                btn.classList.add('selected');
                // Remove selected from others
                popup.querySelectorAll('.quick-btn').forEach(b => {
                    if (b !== btn) b.classList.remove('selected');
                });
            });
        });

        // Advanced options toggle
        popup.querySelector('#advancedToggle').addEventListener('click', () => {
            const content = popup.querySelector('.advanced-content');
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            popup.querySelector('#advancedToggle span').textContent =
                isVisible ? '⚙️ Advanced Options' : '🔽 Hide Advanced';
        });

        // Template selection
        const templateSelect = popup.querySelector('#emailTemplate');
        if (templateSelect) {
            templateSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.applyTemplate(e.target.value);
                }
            });
        }

        // Main action buttons
        popup.querySelector('#cancelCustomization').addEventListener('click', () => {
            this.closeCustomizationPopup();
        });

        popup.querySelector('#previewEmail').addEventListener('click', () => {
            this.previewEmail();
        });

        popup.querySelector('#processWithOptions').addEventListener('click', () => {
            this.processWithCustomization();
        });

        // Auto-save draft functionality
        if (this.settings.autoSaveDraft) {
            this.setupAutoSave();
        }
    }

    // Smart recipient detection and suggestions
    detectAndSuggestRecipients() {
        // Analyze compose view for existing recipients
        try {
            const toField = this.currentComposeView.getToRecipients();
            if (toField && toField.length > 0) {
                const firstName = toField[0].name?.split(' ')[0] || toField[0].emailAddress.split('@')[0];
                this.customizationPopup.querySelector('#recipientName').value = firstName;
            }
        } catch (error) {
            console.log('Could not detect recipients automatically');
        }
    }

    // Apply template to current email
    applyTemplate(templateId) {
        const template = this.templates.find(t => t.id == templateId);
        if (template) {
            const instructionsField = this.customizationPopup.querySelector('#customInstructions');
            instructionsField.value = `Use this template: ${template.content}`;
            this.showMessage('Template applied! Will be merged with your recording.', 'info');
        }
    }

    // Preview email functionality
    async previewEmail() {
        if (!this.rawTranscription) {
            this.showMessage('Still processing audio, please wait...', 'info');
            return;
        }

        try {
            // Generate preview
            const previewText = await this.generateEmailPreview();

            // Show preview modal
            this.showPreviewModal(previewText);

        } catch (error) {
            this.showMessage('Error generating preview', 'error');
        }
    }

    // Show preview in modal
    showPreviewModal(previewText) {
        const modal = document.createElement('div');
        modal.className = 'email-preview-modal';
        modal.innerHTML = `
            <div class="preview-content">
                <div class="preview-header">
                    <h3>📧 Email Preview</h3>
                    <button class="close-preview">✕</button>
                </div>
                <div class="preview-body">
                    <div class="email-preview">${previewText.replace(/\n/g, '<br>')}</div>
                </div>
                <div class="preview-actions">
                    <button class="edit-btn">✏️ Edit</button>
                    <button class="approve-btn">👍 Looks Good</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.close-preview').addEventListener('click', () => {
            modal.remove();
        });

        modal.querySelector('.edit-btn').addEventListener('click', () => {
            modal.remove();
            // Focus back on customization
        });

        modal.querySelector('.approve-btn').addEventListener('click', () => {
            modal.remove();
            this.processWithCustomization();
        });
    }

    // Waveform animation for recording
    startWaveformAnimation() {
        const bars = this.recordingPopup.querySelectorAll('.wave-bar');
        bars.forEach((bar, index) => {
            bar.style.animationDelay = `${index * 0.1}s`;
            bar.style.animation = 'waveform 1.5s infinite ease-in-out';
        });
    }

    // Enhanced timer with features
    startTimer() {
        this.recordingStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            if (this.recordingPopup) {
                const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                const timerElement = this.recordingPopup.querySelector('.recording-timer');
                if (timerElement) {
                    timerElement.textContent = `${minutes}:${seconds}`;

                    // Visual feedback for long recordings
                    if (elapsed > 120) { // 2 minutes
                        timerElement.style.color = '#ff9800';
                    }
                    if (elapsed > 300) { // 5 minutes
                        timerElement.style.color = '#f44336';
                    }
                }
            }
        }, 1000);
    }

    // Pause/resume functionality
    togglePause() {
        if (this.mediaRecorder) {
            if (this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.pause();
                this.recordingPopup.querySelector('#pauseRecording').innerHTML = '▶️';
                this.recordingPopup.querySelector('.recording-indicator span').textContent = 'Paused';
            } else if (this.mediaRecorder.state === 'paused') {
                this.mediaRecorder.resume();
                this.recordingPopup.querySelector('#pauseRecording').innerHTML = '⏸️';
                this.recordingPopup.querySelector('.recording-indicator span').textContent = 'Recording...';
            }
        }
    }

    // Voice command detection
    async detectVoiceCommands(transcription) {
        const commands = {
            'use template': /use template (\w+)/i,
            'set tone': /set tone (professional|friendly|formal|casual|concise)/i,
            'send to': /send to (\w+)/i,
            'make it urgent': /make it urgent|urgent/i,
            'add signature': /add signature|include signature/i
        };

        const detectedCommands = {};

        for (const [command, regex] of Object.entries(commands)) {
            const match = transcription.match(regex);
            if (match) {
                detectedCommands[command] = match[1] || true;
            }
        }

        return detectedCommands;
    }

    // Apply voice commands to customization
    applyVoiceCommands(commands) {
        if (!this.customizationPopup) return;

        if (commands['set tone']) {
            this.customizationPopup.querySelector('#emailTone').value = commands['set tone'];
        }

        if (commands['send to']) {
            this.customizationPopup.querySelector('#recipientName').value = commands['send to'];
        }

        if (commands['make it urgent']) {
            const urgentCheckbox = this.customizationPopup.querySelector('#urgentFlag');
            if (urgentCheckbox) urgentCheckbox.checked = true;
        }

        if (commands['add signature']) {
            const signatureCheckbox = this.customizationPopup.querySelector('#includeSignature');
            if (signatureCheckbox) signatureCheckbox.checked = true;
        }

        if (commands['use template']) {
            const templateSelect = this.customizationPopup.querySelector('#emailTemplate');
            if (templateSelect) {
                const template = this.templates.find(t =>
                    t.name.toLowerCase().includes(commands['use template'].toLowerCase())
                );
                if (template) {
                    templateSelect.value = template.id;
                    this.applyTemplate(template.id);
                }
            }
        }
    }

    // Enhanced recording start
    async startRecording(composeView) {
        if (this.recording) {
            this.sdk.ButterBar.showMessage({ text: 'Recording is already in progress.' });
            return;
        }

        // Load fresh settings
        await this.loadUserSettings();
        this.currentComposeView = composeView;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.mediaRecorder.ondataavailable = (event) => this.chunks.push(event.data);
            this.mediaRecorder.onstop = this.handleRecordingStop.bind(this);

            // Create and show recording popup
            this.createRecordingPopup();

            this.mediaRecorder.start();
            this.recording = true;

            // Track usage
            this.trackUsage('recording_started');

        } catch (error) {
            console.error('Error starting recording:', error);
            this.sdk.ButterBar.showMessage({
                text: 'Microphone access denied. Please enable microphone permissions.'
            });
        }
    }

    // Enhanced recording stop with voice command detection
    async handleRecordingStop() {
        // Clear timer and animations
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        // Remove recording popup
        if (this.recordingPopup) {
            this.recordingPopup.remove();
            this.recordingPopup = null;
        }

        // Quick insert mode check
        if (this.settings.quickInsert) {
            await this.processQuickInsert();
            return;
        }

        // Show customization popup immediately
        this.createCustomizationPopup();

        // Start processing audio in background
        const audioBlob = new Blob(this.chunks, { type: 'audio/webm' });
        this.chunks = [];

        try {
            const storedToken = await this.retrieveToken();
            this.processTranscriptionAsync(audioBlob, storedToken);
        } catch (error) {
            console.error('Error in processing:', error);
            this.updateCustomizationStatus('Error processing audio. Please try again.', true);
        }

        // Stop media tracks
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
    }

    // Quick insert mode (skip customization)
    async processQuickInsert() {
        const audioBlob = new Blob(this.chunks, { type: 'audio/webm' });
        this.chunks = [];

        try {
            const storedToken = await this.retrieveToken();

            // Show minimal processing indicator
            this.sdk.ButterBar.showMessage({
                text: 'Quick processing your email...',
                time: 10000
            });

            const transcriptionText = await processTranscription(audioBlob, storedToken);
            const optimizedText = await postToGPT4Enhanced(
                transcriptionText,
                storedToken,
                '',
                this.settings.defaultTone || 'professional',
                'general'
            );

            this.currentComposeView.insertTextIntoBodyAtCursor(optimizedText);
            this.sdk.ButterBar.showMessage({ text: '✅ Email inserted successfully!' });

            this.trackUsage('quick_insert_completed');

        } catch (error) {
            console.error('Error in quick processing:', error);
            this.sdk.ButterBar.showMessage({ text: 'Error processing email. Please try again.' });
        }

        // Stop media tracks
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
    }

    // Process transcription with voice command detection
    async processTranscriptionAsync(audioBlob, storedToken) {
        try {
            const transcriptionText = await processTranscription(audioBlob, storedToken);
            this.rawTranscription = transcriptionText;

            // Detect voice commands
            const voiceCommands = await this.detectVoiceCommands(transcriptionText);
            if (Object.keys(voiceCommands).length > 0) {
                this.applyVoiceCommands(voiceCommands);
                this.showMessage('Voice commands detected and applied!', 'success');
            }

            this.updateCustomizationStatus('✅ Audio processed! Configure options and click "Insert Email"', false);

            // Enable the process button
            const processBtn = this.customizationPopup?.querySelector('#processWithOptions');
            if (processBtn) {
                processBtn.disabled = false;
            }

        } catch (error) {
            console.error('Error processing transcription:', error);
            this.updateCustomizationStatus('❌ Error processing audio. Please try again.', true);
        }
    }

    // Track usage statistics
    async trackUsage(action) {
        try {
            const stats = await retrieveFromStorage('usage_stats') || {
                todayCount: 0,
                totalCount: 0,
                avgLength: 0,
                lastUsed: new Date().toDateString()
            };

            // Reset daily count if new day
            if (stats.lastUsed !== new Date().toDateString()) {
                stats.todayCount = 0;
                stats.lastUsed = new Date().toDateString();
            }

            if (action === 'recording_started') {
                stats.todayCount++;
                stats.totalCount++;
            }

            await chrome.storage.sync.set({ usage_stats: stats });
        } catch (error) {
            console.error('Error tracking usage:', error);
        }
    }

    // Enhanced message display
    showMessage(message, type = 'info') {
        this.sdk.ButterBar.showMessage({
            text: message,
            time: type === 'error' ? 8000 : 4000
        });
    }

    // Rest of the methods remain the same as previous version...
    async retrieveToken() {
        return await retrieveFromStorage('openai_token');
    }

    updateCustomizationStatus(message, isError = false) {
        if (!this.customizationPopup) return;

        const statusElement = this.customizationPopup.querySelector('.processing-status span');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = isError ? 'error' : 'success';
        }
    }

    async processWithCustomization() {
        if (!this.rawTranscription) {
            this.sdk.ButterBar.showMessage({ text: 'Still processing audio, please wait...' });
            return;
        }

        const processBtn = this.customizationPopup.querySelector('#processWithOptions');
        const btnText = processBtn.querySelector('.btn-text');
        const btnLoading = processBtn.querySelector('.btn-loading');

        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        processBtn.disabled = true;

        try {
            // Get user preferences
            const recipientName = this.customizationPopup.querySelector('#recipientName').value.trim();
            const emailTone = this.customizationPopup.querySelector('#emailTone').value;
            const emailType = this.customizationPopup.querySelector('#emailType').value;
            const customInstructions = this.customizationPopup.querySelector('#customInstructions')?.value || '';
            const includeSignature = this.customizationPopup.querySelector('#includeSignature')?.checked || false;
            const addSubject = this.customizationPopup.querySelector('#addSubject')?.checked || false;

            const storedToken = await this.retrieveToken();

            const optimizedText = await postToGPT4Enhanced(
                this.rawTranscription,
                storedToken,
                recipientName,
                emailTone,
                emailType,
                customInstructions,
                includeSignature,
                addSubject
            );

            this.currentComposeView.insertTextIntoBodyAtCursor(optimizedText);
            this.closeCustomizationPopup();
            this.sdk.ButterBar.showMessage({ text: '🎉 Email transcribed and inserted successfully!' });

            this.trackUsage('email_completed');

        } catch (error) {
            console.error('Error in final processing:', error);
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            processBtn.disabled = false;
            this.sdk.ButterBar.showMessage({ text: 'Error processing email. Please try again.' });
        }
    }

    closeCustomizationPopup() {
        if (this.customizationPopup) {
            this.customizationPopup.remove();
            this.customizationPopup = null;
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.recording) {
            this.mediaRecorder.stop();
            this.recording = false;
        } else {
            this.sdk.ButterBar.showMessage({ text: 'No recording to stop.' });
        }
    }
}

// Global recorder instance
let recorderInstance = null;

// Load InboxSDK with enhanced features
InboxSDK.load(2, "sdk_Transcription_7792b396c1").then((sdk) => {
    sdk.Compose.registerComposeViewHandler((composeView) => {
        if (!recorderInstance) {
            recorderInstance = new AudioRecorder(sdk);
        }

        // Update current compose view
        recorderInstance.currentComposeView = composeView;

        // Enhanced transcription button
        composeView.addButton({
            title: "Voice Transcribe Email (Ctrl+Shift+R)",
            iconUrl: chrome.runtime.getURL("icons/start_icon.png"),
            onClick: () => {
                if (!recorderInstance.recording) {
                    recorderInstance.startRecording(composeView);
                } else {
                    recorderInstance.stopRecording();
                }
            },
            hasDropdown: false,
            type: 'MODIFIER',
        });
    });
});

// Enhanced transcription function (unchanged)
async function processTranscription(audioBlob, storedToken) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'whisper-1');

    const requestOptions = {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${storedToken}` },
        body: formData,
    };

    try {
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', requestOptions);
        if (response.status === 200) {
            const result = await response.json();
            return result.text;
        } else {
            throw new Error(`Transcription failed: ${response.status}`);
        }
    } catch (error) {
        console.error('Error fetching transcription:', error);
        throw new Error('Could not process transcription');
    }
}

// Enhanced GPT-4 processing with all new features
async function postToGPT4Enhanced(transcriptionText, storedToken, recipientName, tone, emailType, customInstructions = '', includeSignature = false, addSubject = false) {
    let systemPrompt = `You are an expert email writing assistant. Create a well-formatted, professional email based on the speech transcription provided.

Instructions:
- Correct any speech recognition errors, especially proper nouns
- Format into proper email structure (greeting, body paragraphs, closing)
- Maintain the original intent and all important content
- Use a ${tone} tone throughout
- This is a ${emailType.replace('-', ' ')} email`;

    if (recipientName) {
        systemPrompt += `\n- Address the email to ${recipientName}`;
    }

    if (customInstructions) {
        systemPrompt += `\n- Additional instructions: ${customInstructions}`;
    }

    if (includeSignature) {
        systemPrompt += `\n- Include an appropriate email signature`;
    }

    if (addSubject) {
        systemPrompt += `\n- Suggest a compelling subject line at the beginning (format: "Subject: [suggestion]")`;
    }

    systemPrompt += `
- Ensure proper paragraph breaks and flow
- Keep the email concise but complete
- Use professional formatting appropriate for the tone
- Do not add extra content not mentioned in the transcription`;

    const gptRequestBody = {
        model: "gpt-4",
        messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: `Please convert this speech transcription into a well-formatted email:\n\n"${transcriptionText}"`
            }
        ],
        temperature: 0.3
    };

    const gptHeaders = new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storedToken}`
    });

    const gptRequestOptions = {
        method: 'POST',
        headers: gptHeaders,
        body: JSON.stringify(gptRequestBody),
    };

    try {
        const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', gptRequestOptions);
        const gptResult = await gptResponse.json();
        return gptResult.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error processing transcription through GPT-4:', error);
        throw new Error('GPT-4 processing failed');
    }
}