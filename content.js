// content.js
(function () {
    // Configuration
    const BUTTON_ID = 'gmail-audio-assistant-button';
    const MODAL_ID = 'gmail-audio-assistant-modal';
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let groqApiKey = '';

    // Load API keys from local storage
    chrome.storage.local.get(['groqApiKey'], function (result) {
        if (result.groqApiKey) {
            groqApiKey = result.groqApiKey;
            debugLog('API key loaded successfully');
        } else {
            debugLog('No API key found in storage');
        }
    });

    // Utility function for debugging
    function debugLog(message, object = null) {
        const DEBUG = true; // Set to false in production
        if (DEBUG) {
            if (object) {
                console.log('[Gmail Audio Assistant]', message, object);
            } else {
                console.log('[Gmail Audio Assistant]', message);
            }
        }
    }

    // Gmail-specific selectors - these may change as Gmail updates
    const GMAIL_SELECTORS = {
        composeAreas: [
            '.Am.Al.editable', // Standard compose area
            '.Ar.Au', // Sometimes used instead
            '[role="textbox"][g_editable="true"]', // Alternative selector
            '[contenteditable="true"]' // Fallback
        ],
        toolbars: [
            '.aal', // Common toolbar class
            '.gU.Up', // Alternative toolbar
            '[role="toolbar"]', // Role-based selector
            '.J-J5-Ji', // Another potential toolbar class
            '.IZ' // Fallback toolbar class
        ]
    };

    // Initialize the extension
    function init() {
        debugLog('Initializing extension');
        // Wait for Gmail to fully load
        const checkExist = setInterval(function () {
            // Check if compose area exists using multiple selectors
            const composeArea = findComposeArea();
            if (composeArea) {
                clearInterval(checkExist);
                debugLog('Found compose area', composeArea);
                injectButton();
                createModal();
            }
        }, 1000);
    }

    // Find the Gmail compose area using multiple selectors
    function findComposeArea() {
        for (const selector of GMAIL_SELECTORS.composeAreas) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }
        return null;
    }

    // Find the Gmail compose toolbar
    function findGmailToolbar() {
        debugLog('Looking for Gmail toolbar');

        // Try to find the compose area first
        const composeArea = findComposeArea();
        if (!composeArea) {
            debugLog('No compose area found');
            return null;
        }

        // Look for potential parent containers
        const potentialParents = [
            composeArea.closest('form'),
            composeArea.closest('div[role="dialog"]'),
            composeArea.closest('.AD'), // Common compose container
            composeArea.closest('.GP'), // Another compose container
            composeArea.parentElement,
            composeArea.parentElement?.parentElement,
            composeArea.parentElement?.parentElement?.parentElement
        ].filter(Boolean); // Filter out nulls

        debugLog('Potential parent containers:', potentialParents);

        // For each potential parent, try all toolbar selectors
        for (const parent of potentialParents) {
            for (const selector of GMAIL_SELECTORS.toolbars) {
                const toolbar = parent.querySelector(selector);
                if (toolbar) {
                    debugLog('Found toolbar:', toolbar);
                    return toolbar;
                }
            }
        }

        // Fallback: try to find any toolbar in the vicinity
        for (const selector of GMAIL_SELECTORS.toolbars) {
            const toolbar = document.querySelector(selector);
            if (toolbar) {
                debugLog('Found toolbar with global search:', toolbar);
                return toolbar;
            }
        }

        // Last resort: the compose area's immediate parent
        const immediateParent = composeArea.parentElement;
        debugLog('No toolbar found, returning immediate parent as fallback:', immediateParent);
        return immediateParent;
    }

    // Inject recording button into Gmail compose toolbar
    function injectButton() {
        debugLog('Injecting button');

        // Wait for compose elements to fully render
        setTimeout(() => {
            // Find toolbar using our helper
            const toolbar = findGmailToolbar();
            if (!toolbar) {
                debugLog('No toolbar found for button injection');
                return;
            }

            if (document.getElementById(BUTTON_ID)) {
                debugLog('Button already exists');
                return;
            }

            debugLog('Creating button element');
            // Create button
            const button = document.createElement('div');
            button.id = BUTTON_ID;
            button.className = 'gmail-audio-btn';
            button.innerHTML = `
          <div class="audio-btn-container">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </svg>
          </div>
        `;
            button.title = 'Record audio for email';

            // Add to toolbar - be careful with insertion
            debugLog('Inserting button into toolbar');
            try {
                const firstChild = toolbar.firstChild;
                toolbar.insertBefore(button, firstChild);
                debugLog('Button inserted successfully');
            } catch (e) {
                debugLog('Error inserting button, trying appendChild', e);
                try {
                    toolbar.appendChild(button);
                } catch (e2) {
                    debugLog('Error appending button', e2);
                }
            }

            // Add event listener
            button.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                toggleRecording();
            });

            // Add styles
            injectStyles();
        }, 500); // 500ms delay to ensure elements are ready
    }

    // Create modal for recording status and email type selection
    function createModal() {
        debugLog('Creating modal');
        if (document.getElementById(MODAL_ID)) {
            debugLog('Modal already exists');
            return;
        }

        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'gmail-audio-modal';
        modal.style.display = 'none';

        modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>Audio Email Assistant</h3>
            <span class="close-btn">&times;</span>
          </div>
          <div class="modal-body">
            <div id="recording-status">
              <p class="status-text">Click to start recording</p>
              <div class="recording-indicator"></div>
            </div>
            <div id="transcription-status" style="display: none;">
              <p>Transcribing your audio...</p>
              <div class="loader"></div>
            </div>
            <div id="email-options" style="display: none;">
              <p>Select email tone:</p>
              <div class="options-container">
                <button class="email-type-btn" data-type="formal">Formal</button>
                <button class="email-type-btn" data-type="friendly">Friendly</button>
                <button class="email-type-btn" data-type="professional">Professional</button>
                <button class="email-type-btn" data-type="casual">Casual</button>
              </div>
            </div>
            <div id="generation-status" style="display: none;">
              <p>Generating your email...</p>
              <div class="loader"></div>
            </div>
          </div>
        </div>
      `;

        document.body.appendChild(modal);
        debugLog('Modal appended to body');

        // Add event listeners
        const closeBtn = modal.querySelector('.close-btn');
        closeBtn.addEventListener('click', function () {
            modal.style.display = 'none';
            resetModalState();
        });

        // Email type selection
        const emailTypeButtons = modal.querySelectorAll('.email-type-btn');
        emailTypeButtons.forEach(button => {
            button.addEventListener('click', function () {
                const emailType = this.getAttribute('data-type');
                generateEmail(emailType);
            });
        });

        // Close when clicking outside
        window.addEventListener('click', function (event) {
            if (event.target === modal) {
                modal.style.display = 'none';
                resetModalState();
            }
        });
    }

    // Inject CSS styles
    function injectStyles() {
        if (document.getElementById('gmail-audio-assistant-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'gmail-audio-assistant-styles';
        style.textContent = `
        .gmail-audio-btn {
          margin: 0 4px;
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        
        .gmail-audio-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        
        .audio-btn-container {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #5f6368;
        }
        
        .audio-btn-container svg {
          width: 20px;
          height: 20px;
        }
        
        .gmail-audio-btn.recording {
          background-color: rgba(234, 67, 53, 0.1);
        }
        
        .gmail-audio-btn.recording .audio-btn-container {
          color: #ea4335;
        }
        
        .gmail-audio-modal {
          display: none;
          position: fixed;
          z-index: 9999;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          overflow: auto;
          background-color: rgba(0, 0, 0, 0.4);
        }
        
        .modal-content {
          background-color: #fefefe;
          margin: 15% auto;
          padding: 20px;
          border: 1px solid #888;
          width: 400px;
          border-radius: 8px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .modal-header h3 {
          margin: 0;
          color: #202124;
        }
        
        .close-btn {
          color: #aaa;
          font-size: 28px;
          font-weight: bold;
          cursor: pointer;
        }
        
        .close-btn:hover {
          color: black;
        }
        
        .recording-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: #ea4335;
          display: none;
          animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
          0% {
            transform: scale(0.95);
            opacity: 0.7;
          }
          50% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(0.95);
            opacity: 0.7;
          }
        }
        
        .status-text {
          margin-bottom: 10px;
        }
        
        .recording-active .recording-indicator {
          display: inline-block;
        }
        
        .loader {
          border: 3px solid #f3f3f3;
          border-radius: 50%;
          border-top: 3px solid #3498db;
          width: 20px;
          height: 20px;
          animation: spin 2s linear infinite;
          margin: 10px auto;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .options-container {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 10px;
        }
        
        .email-type-btn {
          padding: 8px 16px;
          background-color: #f1f3f4;
          border: 1px solid #dadce0;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        
        .email-type-btn:hover {
          background-color: #e8eaed;
        }
      `;
        document.head.appendChild(style);
        debugLog('Styles injected');
    }

    // Validate the Groq API key by making a test request
    function validateGroqApiKey(callback) {
        if (!groqApiKey) {
            callback(false, 'No API key provided');
            return;
        }

        debugLog('Validating Groq API key');

        // Make a lightweight request to check API key validity - use correct endpoint
        fetch('https://api.groq.com/openai/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`
            }
        })
            .then(response => {
                if (response.ok) {
                    debugLog('API key is valid');
                    callback(true);
                } else {
                    debugLog('API key validation failed with status:', response.status);
                    if (response.status === 401) {
                        callback(false, 'Invalid API key');
                    } else {
                        callback(false, `API error (${response.status})`);
                    }
                }
            })
            .catch(error => {
                debugLog('API key validation error:', error);
                callback(false, 'Network error during validation');
            });
    }

    // Toggle recording state
    function toggleRecording() {
        debugLog('Toggle recording, current state:', isRecording);
        if (!isRecording) {
            // Validate API key before starting
            validateGroqApiKey((isValid, errorMessage) => {
                if (isValid) {
                    startRecording();
                } else {
                    alert(`Please check your Groq API key: ${errorMessage || 'Could not validate key'}`);
                }
            });
        } else {
            stopRecording();
        }
    }

    // Start audio recording
    function startRecording() {
        debugLog('Starting recording');
        if (!groqApiKey) {
            alert('Please set your Groq API key in the extension settings first.');
            return;
        }

        // Request microphone access with specific constraints for better compatibility
        navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,  // Mono (more compatible)
                sampleRate: 16000, // 16kHz (commonly used for speech recognition)
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        })
            .then(stream => {
                debugLog('Microphone access granted with constraints');
                // Show modal
                const modal = document.getElementById(MODAL_ID);
                modal.style.display = 'block';

                // Update recording status
                const recordingStatus = document.getElementById('recording-status');
                recordingStatus.classList.add('recording-active');
                recordingStatus.querySelector('.status-text').textContent = 'Recording... Click again to stop';

                // Update button state
                const button = document.getElementById(BUTTON_ID);
                if (button) {
                    button.classList.add('recording');
                }

                // Set up media recorder with better options for compatibility
                const options = {
                    mimeType: 'audio/webm;codecs=opus',  // Most compatible format
                    audioBitsPerSecond: 128000  // 128kbps
                };

                try {
                    mediaRecorder = new MediaRecorder(stream, options);
                    debugLog('Using preferred MIME type:', options.mimeType);
                } catch (e) {
                    // Fallback if preferred MIME type is not supported
                    debugLog('Preferred MIME type not supported, trying fallback options');

                    const fallbackOptions = [
                        { mimeType: 'audio/webm' },
                        { mimeType: 'audio/ogg;codecs=opus' },
                        { mimeType: 'audio/mp4' },
                        {}  // Empty options as last resort
                    ];

                    for (const option of fallbackOptions) {
                        try {
                            mediaRecorder = new MediaRecorder(stream, option);
                            debugLog('Using fallback MIME type:', option.mimeType || 'browser default');
                            break;
                        } catch (err) {
                            // Continue to next option
                        }
                    }

                    if (!mediaRecorder) {
                        throw new Error('Could not create MediaRecorder with any supported options');
                    }
                }

                audioChunks = [];

                mediaRecorder.addEventListener('dataavailable', event => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                        debugLog(`Received audio chunk: ${event.data.size} bytes`);
                    }
                });

                mediaRecorder.addEventListener('stop', () => {
                    // Stop all tracks
                    stream.getTracks().forEach(track => track.stop());

                    // Process the recording
                    if (audioChunks.length > 0) {
                        debugLog(`Recording complete. Total chunks: ${audioChunks.length}`);
                        processRecording();
                    } else {
                        debugLog('No audio data recorded');
                        alert('No audio data was recorded. Please try again.');
                        resetModalState();
                    }
                });

                // Start recording with 1-second chunks for better handling
                mediaRecorder.start(1000);
                debugLog('MediaRecorder started with 1-second chunks');
                isRecording = true;
            })
            .catch(error => {
                debugLog('Error accessing microphone:', error);
                let errorMessage = 'Unable to access microphone. Please check your browser permissions.';

                if (error.name === 'NotAllowedError') {
                    errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
                } else if (error.name === 'NotFoundError') {
                    errorMessage = 'No microphone found. Please connect a microphone and try again.';
                }

                alert(errorMessage);
            });
    }

    // Stop audio recording
    function stopRecording() {
        debugLog('Stopping recording');
        if (!mediaRecorder) return;

        mediaRecorder.stop();
        isRecording = false;

        // Update button state
        const button = document.getElementById(BUTTON_ID);
        if (button) {
            button.classList.remove('recording');
        }

        // Update recording status
        const recordingStatus = document.getElementById('recording-status');
        recordingStatus.classList.remove('recording-active');
        recordingStatus.querySelector('.status-text').textContent = 'Processing audio...';

        // Show transcription status
        document.getElementById('recording-status').style.display = 'none';
        document.getElementById('transcription-status').style.display = 'block';
    }

    // Process the recorded audio
    function processRecording() {
        debugLog('Processing recording');
        // Create audio blob
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

        // Transcribe audio using Groq's Whisper model
        transcribeAudio(audioBlob);
    }

    // Transcribe audio using Groq's Whisper API
    function transcribeAudio(audioBlob) {
        debugLog('Transcribing audio, blob size:', audioBlob.size);

        // Check if API key is set
        if (!groqApiKey) {
            const errorMsg = 'No Groq API key found. Please set your API key in the extension settings.';
            debugLog(errorMsg);
            alert(errorMsg);
            resetModalState();
            return;
        }

        // Log audio format information
        debugLog('Audio blob type:', audioBlob.type);

        // Create a reader to examine the first few bytes of the audio file
        const reader = new FileReader();
        reader.onload = function (e) {
            const arrayBuffer = e.target.result;
            // Convert first few bytes to hex for debugging
            const bytes = new Uint8Array(arrayBuffer.slice(0, 16));
            let hexString = '';
            for (let i = 0; i < bytes.length; i++) {
                hexString += bytes[i].toString(16).padStart(2, '0') + ' ';
            }
            debugLog('Audio header bytes:', hexString);

            // Continue with API call
            sendTranscriptionRequest(audioBlob);
        };
        reader.readAsArrayBuffer(audioBlob);
    }

    // Send the actual transcription request to Groq API
    function sendTranscriptionRequest(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', 'whisper-large-v3'); // Use Groq's Whisper model

        debugLog('Sending request to Groq API...');

        // Add a timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        // Use the correct endpoint URL for Groq API
        fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`
            },
            body: formData,
            signal: controller.signal
        })
            .then(response => {
                clearTimeout(timeoutId);

                debugLog('Groq API response status:', response.status);

                // Clone the response so we can look at the raw response for debugging
                const responseClone = response.clone();

                // Log the full response for debugging
                responseClone.text().then(text => {
                    try {
                        // Try to parse as JSON for nice formatting
                        const jsonResponse = JSON.parse(text);
                        debugLog('Response body:', jsonResponse);
                    } catch (e) {
                        // If not JSON, log as text
                        debugLog('Response body (text):', text);
                    }
                });

                if (!response.ok) {
                    // Handle specific HTTP error codes
                    let errorMessage = `API Error: ${response.status}`;

                    if (response.status === 401) {
                        errorMessage = 'Invalid API key. Please check your Groq API key in the extension settings.';
                    } else if (response.status === 403) {
                        errorMessage = 'API access forbidden. Your API key may not have permission to use the Whisper model.';
                    } else if (response.status === 429) {
                        errorMessage = 'Rate limit exceeded. Please try again later.';
                    } else if (response.status >= 500) {
                        errorMessage = 'Groq API server error. Please try again later.';
                    }

                    throw new Error(errorMessage);
                }

                return response.json();
            })
            .then(data => {
                debugLog('Transcription complete:', data);

                if (!data || !data.text) {
                    throw new Error('Invalid response from API: missing transcription text');
                }

                // Show email type options
                document.getElementById('transcription-status').style.display = 'none';
                document.getElementById('email-options').style.display = 'block';

                // Store transcription for later use
                window.transcribedText = data.text;
            })
            .catch(error => {
                clearTimeout(timeoutId);

                // Handle different error types
                if (error.name === 'AbortError') {
                    debugLog('Request timed out after 30 seconds');
                    alert('Transcription request timed out. Please try again.');
                } else if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
                    debugLog('Network error:', error);
                    alert('Network error. Please check your internet connection and try again.');
                } else {
                    debugLog('Error transcribing audio:', error);
                    alert(`Error transcribing audio: ${error.message || 'Please try again later.'}`);
                }

                resetModalState();
            });
    }

    // Generate email based on transcription and selected type
    function generateEmail(emailType) {
        debugLog('Generating email with type:', emailType);
        if (!window.transcribedText) {
            alert('No transcription available. Please try recording again.');
            return;
        }

        // Show generation status
        document.getElementById('email-options').style.display = 'none';
        document.getElementById('generation-status').style.display = 'block';

        // Prepare prompt for Llama model
        const prompt = `
        You are an email assistant. Please draft a ${emailType} email based on the following transcribed speech:
        
        "${window.transcribedText}"
        
        Format the email appropriately for a ${emailType} tone, including proper greeting and closing.
      `;

        // Add a timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

        debugLog('Sending request to Groq API for email generation');

        // Call Groq API with Llama model - use the correct OpenAI-compatible endpoint
        fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama3-70b-8192', // Use Groq's Llama model
                messages: [
                    { role: 'system', content: 'You are an email drafting assistant that creates well-formatted emails.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 2048
            }),
            signal: controller.signal
        })
            .then(response => {
                clearTimeout(timeoutId);

                debugLog('Groq API response status for email generation:', response.status);

                // Clone the response so we can look at the raw response for debugging
                const responseClone = response.clone();

                // Log the full response for debugging
                responseClone.text().then(text => {
                    try {
                        // Try to parse as JSON for nice formatting
                        const jsonResponse = JSON.parse(text);
                        debugLog('Email generation response:', jsonResponse);
                    } catch (e) {
                        // If not JSON, log as text
                        debugLog('Email generation response (text):', text);
                    }
                });

                if (!response.ok) {
                    // Handle specific HTTP error codes
                    let errorMessage = `API Error: ${response.status}`;

                    if (response.status === 401) {
                        errorMessage = 'Invalid API key. Please check your Groq API key in the extension settings.';
                    } else if (response.status === 403) {
                        errorMessage = 'API access forbidden. Your API key may not have permission to use the Llama model.';
                    } else if (response.status === 429) {
                        errorMessage = 'Rate limit exceeded. Please try again later.';
                    } else if (response.status >= 500) {
                        errorMessage = 'Groq API server error. Please try again later.';
                    }

                    throw new Error(errorMessage);
                }

                return response.json();
            })
            .then(data => {
                debugLog('Email generated successfully');

                if (!data || !data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
                    throw new Error('Invalid response from API: missing email content');
                }

                const emailContent = data.choices[0].message.content;

                // Insert the generated email into the Gmail compose area
                insertEmail(emailContent);

                // Close modal
                document.getElementById(MODAL_ID).style.display = 'none';
                resetModalState();
            })
            .catch(error => {
                clearTimeout(timeoutId);

                // Handle different error types
                if (error.name === 'AbortError') {
                    debugLog('Email generation request timed out after 60 seconds');
                    alert('Email generation request timed out. Please try again.');
                } else if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
                    debugLog('Network error during email generation:', error);
                    alert('Network error. Please check your internet connection and try again.');
                } else {
                    debugLog('Error generating email:', error);
                    alert(`Error generating email: ${error.message || 'Please try again later.'}`);
                }

                resetModalState();
            });
    }

    // Insert email content into Gmail compose area
    function insertEmail(content) {
        debugLog('Inserting email content');
        const composeArea = findComposeArea();
        if (!composeArea) {
            debugLog('No compose area found for insertion');
            alert('Could not find Gmail compose area. Please try again.');
            return;
        }

        // Focus on compose area
        composeArea.focus();

        // Insert content - try different methods as Gmail can be finicky
        try {
            // Method 1: execCommand (deprecated but works in Gmail)
            if (document.execCommand('insertText', false, content)) {
                debugLog('Content inserted with execCommand');
                return;
            }

            // Method 2: setRangeText if supported
            if (typeof composeArea.setRangeText === 'function') {
                composeArea.setRangeText(content, composeArea.selectionStart, composeArea.selectionEnd, 'end');
                debugLog('Content inserted with setRangeText');
                return;
            }

            // Method 3: contentEditable innerHTML
            if (composeArea.isContentEditable) {
                composeArea.innerHTML = content;
                debugLog('Content inserted with innerHTML');
                return;
            }

            // Method 4: value property (fallback)
            if ('value' in composeArea) {
                composeArea.value = content;
                debugLog('Content inserted with value property');
                return;
            }

            debugLog('No insertion method worked, showing alert');
            alert('Could not insert email content. Please copy and paste manually.');
        } catch (e) {
            debugLog('Error inserting email content:', e);
            alert('Error inserting email content. Please try again.');
        }
    }

    // Reset modal to initial state
    function resetModalState() {
        debugLog('Resetting modal state');
        document.getElementById('recording-status').style.display = 'block';
        document.getElementById('recording-status').classList.remove('recording-active');
        document.getElementById('recording-status').querySelector('.status-text').textContent = 'Click to start recording';

        document.getElementById('transcription-status').style.display = 'none';
        document.getElementById('email-options').style.display = 'none';
        document.getElementById('generation-status').style.display = 'none';

        window.transcribedText = null;
    }

    // Listen for page changes in Gmail
    function watchForPageChanges() {
        debugLog('Setting up MutationObserver');
        // Use mutation observer to detect when compose window appears
        const observer = new MutationObserver((mutations) => {
            let shouldInject = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check for new compose areas
                    const composeArea = findComposeArea();
                    if (composeArea && !document.getElementById(BUTTON_ID)) {
                        shouldInject = true;
                        break;
                    }
                }
            }

            if (shouldInject) {
                debugLog('Detected new compose area, injecting button');
                // Slight delay to ensure Gmail has fully rendered the compose area
                setTimeout(() => {
                    injectButton();
                    if (!document.getElementById(MODAL_ID)) {
                        createModal();
                    }
                }, 500);
            }
        });

        // Start observing with proper configuration
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Check if we're in Gmail
    function isInGmail() {
        return window.location.href.includes('mail.google.com');
    }

    // Main initialization
    function main() {
        debugLog('Main initialization');
        if (!isInGmail()) {
            debugLog('Not in Gmail, exiting');
            return;
        }

        // Initialize only when the DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(init, 1000);
                watchForPageChanges();
            });
        } else {
            // Page already loaded
            setTimeout(init, 1000);
            watchForPageChanges();
        }

        // Also initialize on complete load to catch late-loading Gmail components
        window.addEventListener('load', () => {
            setTimeout(init, 2000);
        });
    }

    // Start the extension
    main();
})();