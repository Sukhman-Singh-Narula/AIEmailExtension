// Improved popup script with better UX and validation
document.addEventListener('DOMContentLoaded', function () {
    console.log('🎤 Popup loaded');

    // Elements
    const groqProvider = document.getElementById('groqProvider');
    const openaiProvider = document.getElementById('openaiProvider');
    const groqRadio = document.getElementById('groqRadio');
    const openaiRadio = document.getElementById('openaiRadio');
    const groqApiKey = document.getElementById('groqApiKey');
    const openaiApiKey = document.getElementById('openaiApiKey');
    const saveButton = document.getElementById('saveSettings');
    const status = document.getElementById('status');
    const connectionStatus = document.getElementById('connectionStatus');
    const groqStatus = document.getElementById('groqStatus');
    const openaiStatus = document.getElementById('openaiStatus');

    // Load saved settings
    loadSavedSettings();

    // Provider selection
    groqProvider.addEventListener('click', () => selectProvider('groq'));
    openaiProvider.addEventListener('click', () => selectProvider('openai'));
    groqRadio.addEventListener('change', () => selectProvider('groq'));
    openaiRadio.addEventListener('change', () => selectProvider('openai'));

    // Real-time validation
    groqApiKey.addEventListener('input', () => validateKey('groq', groqApiKey.value));
    openaiApiKey.addEventListener('input', () => validateKey('openai', openaiApiKey.value));

    // Save settings
    saveButton.addEventListener('click', saveSettings);

    // Enter key support
    [groqApiKey, openaiApiKey].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveSettings();
            }
        });
    });

    function selectProvider(provider) {
        console.log('🎤 Selected provider:', provider);

        // Update radio buttons
        groqRadio.checked = provider === 'groq';
        openaiRadio.checked = provider === 'openai';

        // Update visual selection
        groqProvider.classList.toggle('selected', provider === 'groq');
        openaiProvider.classList.toggle('selected', provider === 'openai');

        // Save provider preference immediately
        chrome.storage.local.set({ selectedProvider: provider });

        // Update connection status
        updateConnectionStatus();
    }

    function validateKey(provider, key) {
        const statusElement = provider === 'groq' ? groqStatus : openaiStatus;

        if (!key) {
            statusElement.textContent = '';
            return false;
        }

        // Check format
        const validFormat = provider === 'groq' ? key.startsWith('gsk_') : key.startsWith('sk-');
        const validLength = key.length > 20;

        if (!validFormat) {
            statusElement.textContent = '❌';
            statusElement.title = `${provider === 'groq' ? 'Groq' : 'OpenAI'} keys should start with "${provider === 'groq' ? 'gsk_' : 'sk_'}"`;
            return false;
        }

        if (!validLength) {
            statusElement.textContent = '⚠️';
            statusElement.title = 'Key seems too short';
            return false;
        }

        statusElement.textContent = '✅';
        statusElement.title = 'Valid format';
        return true;
    }

    function updateConnectionStatus() {
        const selectedProvider = groqRadio.checked ? 'groq' : 'openai';
        const key = selectedProvider === 'groq' ? groqApiKey.value : openaiApiKey.value;

        if (key && validateKey(selectedProvider, key)) {
            connectionStatus.className = 'status-indicator connected';
            connectionStatus.title = 'Ready to transcribe';
        } else {
            connectionStatus.className = 'status-indicator disconnected';
            connectionStatus.title = 'API key required';
        }
    }

    async function loadSavedSettings() {
        try {
            const result = await chrome.storage.local.get([
                'groqApiKey',
                'openaiApiKey',
                'selectedProvider'
            ]);

            console.log('🎤 Loaded settings:', {
                ...result,
                groqApiKey: result.groqApiKey ? '[HIDDEN]' : 'none',
                openaiApiKey: result.openaiApiKey ? '[HIDDEN]' : 'none'
            });

            // Load API keys
            if (result.groqApiKey) {
                groqApiKey.value = result.groqApiKey;
                validateKey('groq', result.groqApiKey);
            }
            if (result.openaiApiKey) {
                openaiApiKey.value = result.openaiApiKey;
                validateKey('openai', result.openaiApiKey);
            }

            // Load provider selection (default to Groq)
            const provider = result.selectedProvider || 'groq';
            selectProvider(provider);

            // Show ready status if we have a valid setup
            const selectedProvider = groqRadio.checked ? 'groq' : 'openai';
            const selectedKey = selectedProvider === 'groq' ? result.groqApiKey : result.openaiApiKey;

            if (selectedKey && validateKey(selectedProvider, selectedKey)) {
                showStatus('✅ Ready to transcribe! Go to Gmail and click compose.', 'success');
                saveButton.textContent = '✅ Ready to Use';
            }

        } catch (error) {
            console.error('🎤 Error loading settings:', error);
            showStatus('Error loading settings', 'error');
        }
    }

    async function saveSettings() {
        console.log('🎤 Saving settings...');

        const selectedProvider = groqRadio.checked ? 'groq' : 'openai';
        const groqKey = groqApiKey.value.trim();
        const openaiKey = openaiApiKey.value.trim();

        // Validate based on selected provider
        if (selectedProvider === 'groq' && !groqKey) {
            showStatus('Please enter your Groq API key', 'error');
            groqApiKey.focus();
            return;
        }

        if (selectedProvider === 'openai' && !openaiKey) {
            showStatus('Please enter your OpenAI API key', 'error');
            openaiApiKey.focus();
            return;
        }

        // Validate key format
        const currentKey = selectedProvider === 'groq' ? groqKey : openaiKey;
        if (!validateKey(selectedProvider, currentKey)) {
            showStatus(`Invalid ${selectedProvider === 'groq' ? 'Groq' : 'OpenAI'} API key format`, 'error');
            const input = selectedProvider === 'groq' ? groqApiKey : openaiApiKey;
            input.focus();
            return;
        }

        // Show loading state
        saveButton.disabled = true;
        saveButton.className = 'save-button loading';
        showStatus('Saving settings...', 'info');

        try {
            // Save to chrome.storage.local (consistent with content script)
            await chrome.storage.local.set({
                selectedProvider: selectedProvider,
                groqApiKey: groqKey,
                openaiApiKey: openaiKey
            });

            console.log('🎤 Settings saved successfully');

            // Update UI to show success
            saveButton.textContent = '✅ Saved! Ready to Use';
            saveButton.className = 'save-button';
            updateConnectionStatus();

            showStatus('🎉 Setup complete! Go to Gmail and click compose to start transcribing.', 'success');

            // Auto-close popup after success (but give time to read message)
            setTimeout(() => {
                window.close();
            }, 2000);

        } catch (error) {
            console.error('🎤 Error saving settings:', error);
            showStatus('Error saving settings: ' + error.message, 'error');
        } finally {
            saveButton.disabled = false;
            if (saveButton.className.includes('loading')) {
                saveButton.className = 'save-button';
                saveButton.textContent = 'Save & Activate';
            }
        }
    }

    function showStatus(message, type) {
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';

        // Auto-hide after 5 seconds for error messages
        if (type === 'error') {
            setTimeout(() => {
                status.style.display = 'none';
            }, 5000);
        }
    }

    // Real-time connection status updates
    setInterval(updateConnectionStatus, 1000);
});