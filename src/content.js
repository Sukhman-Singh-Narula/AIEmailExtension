// Fixed Gmail Extension with proper API key loading
console.log('🎤 Email Transcription Extension: Content script loaded!');

class GmailEmailRecorder {
    constructor() {
        console.log('🎤 Initializing GmailEmailRecorder...');
        this.recording = false;
        this.mediaRecorder = null;
        this.stream = null;
        this.chunks = [];
        this.recordingPopup = null;
        this.customizationPopup = null;
        this.currentComposeView = null;
        this.provider = 'groq'; // default
        this.apiKey = null;

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            console.log('🎤 Waiting for DOM to load...');
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            console.log('🎤 DOM already loaded, initializing...');
            this.init();
        }
    }

    async init() {
        console.log('🎤 Gmail extension initialized!');

        // Load settings first
        await this.loadSettings();

        // Wait a bit for Gmail to load, then start looking for compose windows
        setTimeout(() => {
            this.waitForGmail();
        }, 2000);
    }

    async loadSettings() {
        return new Promise((resolve) => {
            // Use chrome.storage.local consistently (same as popup)
            chrome.storage.local.get([
                'selectedProvider',
                'groqApiKey',
                'openaiApiKey'
            ], (result) => {
                console.log('🎤 Raw storage result:', result);

                this.provider = result.selectedProvider || 'groq';

                if (this.provider === 'groq' && result.groqApiKey) {
                    this.apiKey = result.groqApiKey;
                    console.log('🎤 Loaded Groq API key:', this.apiKey ? 'Set' : 'Not set');
                } else if (this.provider === 'openai' && result.openaiApiKey) {
                    this.apiKey = result.openaiApiKey;
                    console.log('🎤 Loaded OpenAI API key:', this.apiKey ? 'Set' : 'Not set');
                } else {
                    this.apiKey = null;
                    console.log('🎤 No API key found for provider:', this.provider);
                }

                console.log('🎤 Final settings - Provider:', this.provider, 'API Key:', this.apiKey ? 'Available' : 'Missing');
                resolve();
            });
        });
    }

    waitForGmail() {
        console.log('🎤 Starting to look for Gmail compose windows...');

        const checkForCompose = () => {
            const composeSelectors = [
                '[role="dialog"]',
                '.nH .no',
                '.AD',
                '[gh="cm"]'
            ];

            let foundCompose = false;

            composeSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (this.isComposeWindow(element) && !element.querySelector('.voice-transcribe-btn')) {
                        console.log('🎤 Found compose window!', element);
                        this.addButtonToCompose(element);
                        foundCompose = true;
                    }
                });
            });

            if (!foundCompose) {
                this.addComposeButtonListener();
            }
        };

        checkForCompose();
        setInterval(checkForCompose, 2000);

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log('🎤 URL changed, checking for compose windows...');
                setTimeout(checkForCompose, 1000);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    isComposeWindow(element) {
        const indicators = [
            'input[name="to"]',
            'input[name="cc"]',
            'input[name="bcc"]',
            'input[name="subject"]',
            '[name="to"]',
            '[name="subject"]',
            '.aoT',
            '.gO',
            '[role="textbox"]'
        ];

        return indicators.some(selector => element.querySelector(selector));
    }

    addComposeButtonListener() {
        const composeButtons = document.querySelectorAll('[role="button"]');
        composeButtons.forEach(button => {
            const text = button.textContent.toLowerCase();
            if (text.includes('compose') && !button.hasAttribute('data-voice-listener')) {
                button.setAttribute('data-voice-listener', 'true');
                button.addEventListener('click', () => {
                    console.log('🎤 Compose button clicked, waiting for window...');
                    setTimeout(() => {
                        this.waitForGmail();
                    }, 1000);
                });
            }
        });
    }

    addButtonToCompose(composeDialog) {
        console.log('🎤 Attempting to add button to compose window...');

        const toolbarSelectors = [
            '[role="toolbar"]',
            '.gU',
            '.btC',
            '.dC',
            '.aDh',
            '.aoP',
            '.wO',
            '.az9'
        ];

        let toolbar = null;
        for (const selector of toolbarSelectors) {
            toolbar = composeDialog.querySelector(selector);
            if (toolbar) {
                console.log('🎤 Found toolbar with selector:', selector);
                break;
            }
        }

        if (!toolbar) {
            const sendButton = composeDialog.querySelector('[data-tooltip*="Send"]') ||
                composeDialog.querySelector('[aria-label*="Send"]') ||
                composeDialog.querySelector('.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3');
            if (sendButton) {
                toolbar = sendButton.parentElement;
                console.log('🎤 Found toolbar via send button');
            }
        }

        if (!toolbar) {
            console.log('🎤 No toolbar found, creating one...');
            const composeBody = composeDialog.querySelector('[contenteditable="true"]') ||
                composeDialog.querySelector('[role="textbox"]');
            if (composeBody) {
                toolbar = document.createElement('div');
                toolbar.style.cssText = 'padding: 10px; border-top: 1px solid #e0e0e0;';
                composeBody.parentElement.appendChild(toolbar);
            }
        }

        if (!toolbar) {
            console.log('🎤 Could not find or create toolbar');
            return;
        }

        console.log('🎤 Adding voice button to toolbar...');

        const voiceButton = document.createElement('button');
        voiceButton.className = 'voice-transcribe-btn';
        voiceButton.innerHTML = `Voice (${this.provider.toUpperCase()})`;
        voiceButton.title = `Voice Transcribe Email using ${this.provider.toUpperCase()}`;
        voiceButton.style.cssText = `
            background: #1a73e8;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            margin: 4px;
            font-size: 13px;
            font-weight: 500;
            z-index: 1000;
            position: relative;
        `;

        voiceButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🎤 Voice button clicked!');

            // ALWAYS reload settings before recording
            console.log('🎤 Reloading settings before recording...');
            await this.loadSettings();

            if (!this.apiKey) {
                console.log('🎤 No API key found after reload');
                this.showMessage(`Please set your ${this.provider.toUpperCase()} API key in the extension popup first.`);
                return;
            }

            console.log('🎤 API key confirmed, starting recording...');
            this.currentComposeView = composeDialog;
            if (!this.recording) {
                this.startRecording();
            } else {
                this.stopRecording();
            }
        });

        toolbar.appendChild(voiceButton);
        console.log('🎤 Voice button added successfully!');

        this.addFallbackButton(composeDialog);
    }

    addFallbackButton(composeDialog) {
        const floatingButton = document.createElement('div');
        floatingButton.innerHTML = 'MIC';
        floatingButton.title = `Voice Transcribe Email using ${this.provider.toUpperCase()}`;
        floatingButton.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            width: 50px;
            height: 40px;
            background: #1a73e8;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;

        floatingButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🎤 Floating voice button clicked!');

            // ALWAYS reload settings before recording
            await this.loadSettings();

            if (!this.apiKey) {
                this.showMessage(`Please set your ${this.provider.toUpperCase()} API key in the extension popup first.`);
                return;
            }

            this.currentComposeView = composeDialog;
            if (!this.recording) {
                this.startRecording();
            } else {
                this.stopRecording();
            }
        });

        composeDialog.style.position = 'relative';
        composeDialog.appendChild(floatingButton);
        console.log('🎤 Floating voice button added!');
    }

    async startRecording() {
        console.log('🎤 Starting recording with API key:', this.apiKey ? 'Available' : 'Missing');

        if (this.recording) {
            this.showMessage('Recording is already in progress.');
            return;
        }

        if (!this.apiKey) {
            this.showMessage(`Please set your ${this.provider.toUpperCase()} API key in the extension popup first.`);
            return;
        }

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

            this.createRecordingPopup();
            this.mediaRecorder.start();
            this.recording = true;

            console.log('🎤 Recording started successfully!');

            const buttons = this.currentComposeView.querySelectorAll('.voice-transcribe-btn');
            buttons.forEach(button => {
                button.innerHTML = 'Stop';
                button.style.background = '#d93025';
            });

        } catch (error) {
            console.error('🎤 Error starting recording:', error);
            this.showMessage('Microphone access denied. Please enable microphone permissions.');
        }
    }

    createRecordingPopup() {
        console.log('🎤 Creating recording popup...');

        const popup = document.createElement('div');
        popup.className = 'transcription-recording-popup';
        popup.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                width: 320px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                z-index: 100000;
                font-family: 'Google Sans', sans-serif;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="
                            width: 8px;
                            height: 8px;
                            background: #ff4757;
                            border-radius: 50%;
                            animation: pulse 1.5s infinite;
                        "></div>
                        <span style="font-weight: 600;">Recording...</span>
                    </div>
                    <div class="recording-timer" style="
                        font-family: monospace;
                        font-weight: 600;
                        background: rgba(255,255,255,0.2);
                        padding: 4px 8px;
                        border-radius: 10px;
                    ">00:00</div>
                </div>
                <div style="text-align: center; margin: 15px 0;">
                    <button id="stopRecording" style="
                        background: #ff4757;
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 20px;
                        cursor: pointer;
                        font-weight: 500;
                        font-size: 14px;
                    ">Stop & Process</button>
                </div>
                <div style="font-size: 12px; opacity: 0.8; text-align: center;">
                    Using ${this.provider.toUpperCase()} - Speak clearly for best results
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(1.3); }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(popup);
        this.recordingPopup = popup;

        this.startTimer();

        popup.querySelector('#stopRecording').addEventListener('click', () => {
            this.stopRecording();
        });
    }

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
                }
            }
        }, 1000);
    }

    async handleRecordingStop() {
        console.log('🎤 Handling recording stop...');

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        if (this.recordingPopup) {
            this.recordingPopup.remove();
            this.recordingPopup = null;
        }

        const buttons = this.currentComposeView.querySelectorAll('.voice-transcribe-btn');
        buttons.forEach(button => {
            button.innerHTML = `Voice (${this.provider.toUpperCase()})`;
            button.style.background = '#1a73e8';
        });

        this.createCustomizationPopup();

        const audioBlob = new Blob(this.chunks, { type: 'audio/webm' });
        this.chunks = [];

        try {
            this.processTranscriptionAsync(audioBlob);
        } catch (error) {
            console.error('🎤 Error in processing:', error);
            this.updateCustomizationStatus('Error processing audio. Please try again.');
        }

        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
    }

    createCustomizationPopup() {
        console.log('🎤 Creating customization popup...');

        const popup = document.createElement('div');
        popup.className = 'transcription-customization-popup';
        popup.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 450px;
                max-width: 90vw;
                background: white;
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                z-index: 100001;
                font-family: 'Google Sans', sans-serif;
                overflow: hidden;
            ">
                <div style="
                    padding: 24px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                ">
                    <h3 style="margin: 0 0 10px 0; font-size: 18px;">Customize Your Email</h3>
                    <div class="processing-status" style="
                        background: rgba(255,255,255,0.2);
                        padding: 8px 12px;
                        border-radius: 20px;
                        font-size: 14px;
                    ">Processing audio with ${this.provider.toUpperCase()}...</div>
                </div>
                
                <div style="padding: 24px;">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">To (optional):</label>
                        <input type="text" id="recipientName" placeholder="e.g., John, Dr. Smith" style="
                            width: 100%;
                            padding: 10px;
                            border: 2px solid #e0e0e0;
                            border-radius: 8px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>
                    
                    <div style="display: flex; gap: 16px; margin-bottom: 20px;">
                        <div style="flex: 1;">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px;">Tone:</label>
                            <select id="emailTone" style="
                                width: 100%;
                                padding: 10px;
                                border: 2px solid #e0e0e0;
                                border-radius: 8px;
                                font-size: 14px;
                            ">
                                <option value="professional">Professional</option>
                                <option value="friendly">Friendly</option>
                                <option value="formal">Formal</option>
                                <option value="casual">Casual</option>
                            </select>
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px;">Type:</label>
                            <select id="emailType" style="
                                width: 100%;
                                padding: 10px;
                                border: 2px solid #e0e0e0;
                                border-radius: 8px;
                                font-size: 14px;
                            ">
                                <option value="general">General</option>
                                <option value="request">Request</option>
                                <option value="follow-up">Follow-up</option>
                                <option value="thank-you">Thank You</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div style="
                    padding: 20px 24px;
                    background: #f8f9fa;
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                ">
                    <button id="cancelCustomization" style="
                        background: transparent;
                        color: #666;
                        border: 2px solid #ddd;
                        padding: 10px 20px;
                        border-radius: 20px;
                        cursor: pointer;
                        font-weight: 500;
                    ">Cancel</button>
                    <button id="processWithOptions" disabled style="
                        background: #4caf50;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 20px;
                        cursor: pointer;
                        font-weight: 500;
                    ">
                        <span class="btn-text">Insert Email</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(popup);
        this.customizationPopup = popup;

        popup.querySelector('#cancelCustomization').addEventListener('click', () => {
            this.closeCustomizationPopup();
        });

        popup.querySelector('#processWithOptions').addEventListener('click', () => {
            this.processWithCustomization();
        });
    }

    async processTranscriptionAsync(audioBlob) {
        console.log('🎤 Processing transcription with', this.provider, 'API key available:', !!this.apiKey);

        try {
            const transcriptionText = await this.processTranscription(audioBlob);
            this.rawTranscription = transcriptionText;

            console.log('🎤 Transcription complete:', transcriptionText);

            this.updateCustomizationStatus('Audio processed! Configure options and click "Insert Email"');

            const processBtn = this.customizationPopup?.querySelector('#processWithOptions');
            if (processBtn) {
                processBtn.disabled = false;
            }

        } catch (error) {
            console.error('🎤 Error processing transcription:', error);
            this.updateCustomizationStatus('Error processing audio. Please try again.');
        }
    }

    async processTranscription(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');

        let url, model;

        if (this.provider === 'groq') {
            url = 'https://api.groq.com/openai/v1/audio/transcriptions';
            model = 'whisper-large-v3';
        } else {
            url = 'https://api.openai.com/v1/audio/transcriptions';
            model = 'whisper-1';
        }

        formData.append('model', model);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.apiKey}` },
            body: formData,
        });

        if (response.ok) {
            const result = await response.json();
            return result.text;
        } else {
            const errorText = await response.text();
            console.error('🎤 Transcription API error:', response.status, errorText);
            throw new Error(`Transcription failed: ${response.status}`);
        }
    }

    async processWithCustomization() {
        console.log('🎤 Processing with customization...');

        if (!this.rawTranscription) {
            this.showMessage('Still processing audio, please wait...');
            return;
        }

        const processBtn = this.customizationPopup.querySelector('#processWithOptions');
        processBtn.disabled = true;
        processBtn.querySelector('.btn-text').textContent = 'Processing...';

        try {
            const recipientName = this.customizationPopup.querySelector('#recipientName').value.trim();
            const emailTone = this.customizationPopup.querySelector('#emailTone').value;
            const emailType = this.customizationPopup.querySelector('#emailType').value;

            const optimizedText = await this.processWithAI(
                this.rawTranscription,
                recipientName,
                emailTone,
                emailType
            );

            console.log('🎤 Generated email:', optimizedText);

            this.insertTextIntoCompose(optimizedText);
            this.closeCustomizationPopup();
            this.showMessage('Email transcribed and inserted successfully!');

        } catch (error) {
            console.error('🎤 Error in final processing:', error);
            processBtn.disabled = false;
            processBtn.querySelector('.btn-text').textContent = 'Insert Email';
            this.showMessage('Error processing email. Please try again.');
        }
    }

    async processWithAI(transcriptionText, recipientName, tone, emailType) {
        let systemPrompt = `You are an expert email writing assistant. Create a well-formatted, professional email based on the speech transcription provided.

Instructions:
- Correct any speech recognition errors
- Format into proper email structure (greeting, body, closing)
- Use a ${tone} tone throughout
- This is a ${emailType} email`;

        if (recipientName) {
            systemPrompt += `\n- Address the email to ${recipientName}`;
        }

        const requestBody = {
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Please convert this speech transcription into a well-formatted email:\n\n"${transcriptionText}"` }
            ],
            temperature: 0.3,
            max_tokens: 2048
        };

        let url;

        if (this.provider === 'groq') {
            url = 'https://api.groq.com/openai/v1/chat/completions';
            requestBody.model = "llama-3.3-70b-versatile";
        } else {
            url = 'https://api.openai.com/v1/chat/completions';
            requestBody.model = "gpt-4";
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(requestBody),
        });

        if (response.ok) {
            const result = await response.json();
            return result.choices[0].message.content.trim();
        } else {
            const errorText = await response.text();
            console.error('🎤 AI API error:', response.status, errorText);
            throw new Error(`AI processing failed: ${response.status}`);
        }
    }

    insertTextIntoCompose(text) {
        console.log('🎤 Inserting text into compose...');

        const composeSelectors = [
            '[contenteditable="true"]',
            '[role="textbox"]',
            '.Am.Al.editable',
            '.editable',
            '[g_editable="true"]',
            '.ii.gt div[contenteditable="true"]'
        ];

        let composeBody = null;
        for (const selector of composeSelectors) {
            composeBody = this.currentComposeView.querySelector(selector);
            if (composeBody) {
                console.log('🎤 Found compose body with selector:', selector);
                break;
            }
        }

        if (composeBody) {
            composeBody.focus();
            composeBody.innerHTML = '';

            const formattedText = text.replace(/\n/g, '<br><br>');
            composeBody.innerHTML = formattedText;

            const events = ['input', 'change', 'keyup'];
            events.forEach(eventType => {
                const event = new Event(eventType, { bubbles: true });
                composeBody.dispatchEvent(event);
            });

            console.log('🎤 Text inserted successfully!');
        } else {
            console.error('🎤 Could not find compose body to insert text');
            this.showMessage('Error: Could not find compose window to insert text');
        }
    }

    updateCustomizationStatus(message) {
        if (!this.customizationPopup) return;
        const statusElement = this.customizationPopup.querySelector('.processing-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    closeCustomizationPopup() {
        if (this.customizationPopup) {
            this.customizationPopup.remove();
            this.customizationPopup = null;
        }
    }

    stopRecording() {
        console.log('🎤 Stopping recording...');
        if (this.mediaRecorder && this.recording) {
            this.mediaRecorder.stop();
            this.recording = false;
        }
    }

    showMessage(message) {
        console.log('🎤 Email Transcription:', message);

        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #333;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 100002;
            font-family: 'Google Sans', sans-serif;
            max-width: 400px;
            text-align: center;
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4000);
    }
}

// Initialize the extension
console.log('🎤 Creating GmailEmailRecorder instance...');
const recorder = new GmailEmailRecorder();

// Test button for debugging
setTimeout(() => {
    const testButton = document.createElement('div');
    testButton.innerHTML = 'TEST';
    testButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: #1a73e8;
        color: white;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 100000;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    testButton.title = 'Extension loaded! Click compose to see voice button.';
    testButton.onclick = () => {
        recorder.loadSettings().then(() => {
            alert(`Extension Status:\n\nProvider: ${recorder.provider}\nAPI Key: ${recorder.apiKey ? 'Set' : 'Missing'}\n\n1. Click compose in Gmail\n2. Look for voice button\n3. Make sure API key is saved`);
        });
    };
    document.body.appendChild(testButton);
}, 3000);