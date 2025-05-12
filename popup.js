// popup.js
document.addEventListener('DOMContentLoaded', function () {
    // Load saved API key from local storage instead of sync
    chrome.storage.local.get(['groqApiKey'], function (result) {
        if (result.groqApiKey) {
            document.getElementById('groqApiKey').value = result.groqApiKey;
        }
    });

    // Save settings
    document.getElementById('saveSettings').addEventListener('click', function () {
        const groqApiKey = document.getElementById('groqApiKey').value;

        // Use local storage instead of sync storage
        chrome.storage.local.set({
            groqApiKey: groqApiKey
        }, function () {
            // Check for any errors
            if (chrome.runtime.lastError) {
                console.error('Error saving settings:', chrome.runtime.lastError);
                const status = document.getElementById('status');
                status.textContent = 'Error saving settings: ' + chrome.runtime.lastError.message;
                status.style.color = 'red';
            } else {
                const status = document.getElementById('status');
                status.textContent = 'Settings saved!';
                status.style.color = 'green';
                setTimeout(function () {
                    status.textContent = '';
                }, 2000);
            }
        });
    });
});