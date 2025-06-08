// src/popup.js - Standalone popup script (no React)
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

    // Load saved settings
    loadSavedSettings();

    // Provider selection
    groqProvider.addEventListener('click', () => selectProvider('groq'));
    openaiProvider.addEventListener('click', () => selectProvider('openai'));
    groqRadio.addEventListener('change', () => selectProvider('groq'));
    openaiRadio.addEventListener('change', () => selectProvider('openai'));

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

        // Save provider preference
        chrome.storage.local.set({ selectedProvider: provider });
    }

    async function loadSavedSettings() {
        try {
            const result = await chrome.storage.local.get([
                'groqApiKey',
                'openaiApiKey',
                'selectedProvider'
            ]);

            console.log('🎤 Loaded settings:', { ...result, groqApiKey: result.groqApiKey ? '[HIDDEN]' : 'none', openaiApiKey: result.openaiApiKey ? '[HIDDEN]' : 'none' });

            // Load API keys
            if (result.groqApiKey) {
                groqApiKey.value = result.groqApiKey;
            }
            if (result.openaiApiKey) {
                openaiApiKey.value = result.openaiApiKey;
            }

            // Load provider selection (default to Groq)
            const provider = result.selectedProvider || 'groq';
            selectProvider(provider);

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
        if (selectedProvider === 'groq' && !groqKey.startsWith('gsk_')) {
            showStatus('Groq API keys should start with "gsk_"', 'error');
            groqApiKey.focus();
            return;
        }

        if (selectedProvider === 'openai' && !openaiKey.startsWith('sk-')) {
            showStatus('OpenAI API keys should start with "sk-"', 'error');
            openaiApiKey.focus();
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        try {
            // Save to storage
            await chrome.storage.local.set({
                selectedProvider: selectedProvider,
                groqApiKey: groqKey,
                openaiApiKey: openaiKey
            });

            console.log('🎤 Settings saved successfully');
            showStatus('✅ Settings saved successfully!', 'success');

            // Auto-close popup after success
            setTimeout(() => {
                window.close();
            }, 1500);

        } catch (error) {
            console.error('🎤 Error saving settings:', error);
            showStatus('Error saving settings: ' + error.message, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Settings';
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
});