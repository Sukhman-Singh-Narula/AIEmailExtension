// Import necessary React and Material-UI components
import React, { useState, useEffect } from 'react';
import {
    CssBaseline, Box, TextField, Typography, Button, ThemeProvider,
    Snackbar, Alert, Divider, Chip, IconButton, Tooltip, Switch,
    FormControlLabel, Tabs, Tab, List, ListItem, ListItemText,
    ListItemSecondaryAction, Fab, LinearProgress, Paper
} from '@mui/material';
import createTheme from '@mui/material/styles/createTheme';
import themeOptions from './themeOptions';

// Create a custom theme using theme options
const whiteTheme = createTheme(themeOptions);

// TabPanel component for organized interface
function TabPanel({ children, value, index, ...other }) {
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
        </div>
    );
}

// Main App component
function App() {
    // State management
    const [activeTab, setActiveTab] = useState(0);
    const [token, setToken] = useState('');
    const [tokenStatus, setTokenStatus] = useState('idle'); // idle, validating, valid, invalid
    const [openSnackbar, setOpenSnackbar] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarSeverity, setSnackbarSeverity] = useState('info');
    const [settings, setSettings] = useState({
        autoDetectNames: true,
        smartPunctuation: true,
        quickInsert: false,
        defaultTone: 'professional',
        includeSignature: true,
        enableShortcuts: true
    });
    const [templates, setTemplates] = useState([]);
    const [usageStats, setUsageStats] = useState({ todayCount: 0, totalCount: 0, avgLength: 0 });

    // Load existing settings on component mount
    useEffect(() => {
        loadExistingData();
    }, []);

    const loadExistingData = async () => {
        try {
            // Load existing token
            const result = await chrome.storage.sync.get(['openai_token', 'user_settings', 'email_templates', 'usage_stats']);
            if (result.openai_token) {
                setToken(result.openai_token);
                setTokenStatus('valid');
            }
            if (result.user_settings) {
                setSettings({ ...settings, ...result.user_settings });
            }
            if (result.email_templates) {
                setTemplates(result.email_templates);
            }
            if (result.usage_stats) {
                setUsageStats(result.usage_stats);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    // Real-time token validation as user types
    useEffect(() => {
        if (token.length > 20) { // Basic length check
            const timeoutId = setTimeout(() => {
                validateTokenRealTime(token);
            }, 1000); // Debounce validation
            return () => clearTimeout(timeoutId);
        } else if (token.length > 0) {
            setTokenStatus('invalid');
        } else {
            setTokenStatus('idle');
        }
    }, [token]);

    const validateTokenRealTime = async (apiKey) => {
        if (!apiKey.startsWith('sk-')) {
            setTokenStatus('invalid');
            return;
        }

        setTokenStatus('validating');
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (response.ok) {
                setTokenStatus('valid');
                // Auto-save valid token
                await chrome.storage.sync.set({ openai_token: apiKey });
                showMessage('API key validated and saved automatically!', 'success');
            } else {
                setTokenStatus('invalid');
            }
        } catch (error) {
            setTokenStatus('invalid');
        }
    };

    // Auto-detect API key from clipboard
    const handlePasteDetection = async () => {
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText.startsWith('sk-') && clipboardText.length > 40) {
                setToken(clipboardText);
                showMessage('API key detected from clipboard!', 'info');
            }
        } catch (error) {
            showMessage('Please paste your API key manually', 'info');
        }
    };

    // Enhanced token save with better UX
    const handleTokenSave = async () => {
        if (tokenStatus === 'valid') {
            showMessage('API key is already saved and ready!', 'success');
            return;
        }

        if (!token.trim()) {
            showMessage('Please enter an API key!', 'warning');
            return;
        }

        setTokenStatus('validating');
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                await chrome.storage.sync.set({ openai_token: token });
                setTokenStatus('valid');
                showMessage('🎉 Setup complete! Ready to transcribe emails.', 'success');
                // Auto-switch to usage tab
                setTimeout(() => setActiveTab(1), 1500);
            } else {
                setTokenStatus('invalid');
                showMessage('Invalid API key. Please check and try again.', 'error');
            }
        } catch (error) {
            setTokenStatus('invalid');
            showMessage('Network error. Please try again.', 'error');
        }
    };

    // Save settings
    const handleSettingChange = async (setting, value) => {
        const newSettings = { ...settings, [setting]: value };
        setSettings(newSettings);
        await chrome.storage.sync.set({ user_settings: newSettings });
        showMessage('Settings saved!', 'success');
    };

    // Template management
    const addTemplate = async () => {
        const templateName = prompt('Enter template name:');
        const templateContent = prompt('Enter template content:');
        if (templateName && templateContent) {
            const newTemplate = { id: Date.now(), name: templateName, content: templateContent };
            const updatedTemplates = [...templates, newTemplate];
            setTemplates(updatedTemplates);
            await chrome.storage.sync.set({ email_templates: updatedTemplates });
            showMessage('Template added!', 'success');
        }
    };

    const deleteTemplate = async (templateId) => {
        const updatedTemplates = templates.filter(t => t.id !== templateId);
        setTemplates(updatedTemplates);
        await chrome.storage.sync.set({ email_templates: updatedTemplates });
        showMessage('Template deleted!', 'info');
    };

    const showMessage = (message, severity) => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setOpenSnackbar(true);
    };

    const handleCloseSnackbar = (event, reason) => {
        if (reason === 'clickaway') return;
        setOpenSnackbar(false);
    };

    const getTokenInputColor = () => {
        switch (tokenStatus) {
            case 'valid': return 'success';
            case 'invalid': return 'error';
            case 'validating': return 'info';
            default: return 'primary';
        }
    };

    const getTokenHelperText = () => {
        switch (tokenStatus) {
            case 'valid': return '✅ Valid API key - Ready to transcribe!';
            case 'invalid': return '❌ Invalid API key format or unauthorized';
            case 'validating': return '🔄 Validating API key...';
            default: return 'Enter your OpenAI API key (starts with sk-)';
        }
    };

    return (
        <ThemeProvider theme={whiteTheme}>
            <CssBaseline />
            <Box display="flex" flexDirection="column" width="420px" maxHeight="600px" bgcolor="background.paper" borderRadius={2}>
                {/* Header */}
                <Box sx={{ p: 3, pb: 1 }}>
                    <Typography variant="h5" textAlign="center" gutterBottom fontWeight="600">
                        🎤 Email Transcription Pro
                    </Typography>
                    <Box display="flex" gap="6px" flexWrap="wrap" justifyContent="center" mb={1}>
                        <Chip label="AI-Powered" size="small" color="primary" />
                        <Chip label="One-Click" size="small" color="secondary" />
                        <Chip label="Smart Format" size="small" color="success" />
                    </Box>
                </Box>

                {/* Navigation Tabs */}
                <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} centered>
                    <Tab label="Setup" />
                    <Tab label="Quick Start" />
                    <Tab label="Settings" />
                    <Tab label="Templates" />
                </Tabs>

                <Box sx={{ flexGrow: 1, overflow: 'auto', px: 3, pb: 3 }}>
                    {/* Setup Tab */}
                    <TabPanel value={activeTab} index={0}>
                        <Box display="flex" flexDirection="column" gap="16px">
                            {tokenStatus === 'validating' && <LinearProgress />}

                            <TextField
                                fullWidth
                                label="OpenAI API Token"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="sk-..."
                                type={token.length > 10 ? 'password' : 'text'}
                                variant="outlined"
                                color={getTokenInputColor()}
                                helperText={getTokenHelperText()}
                                InputProps={{
                                    endAdornment: (
                                        <Tooltip title="Paste from clipboard">
                                            <IconButton onClick={handlePasteDetection} size="small">
                                                📋
                                            </IconButton>
                                        </Tooltip>
                                    )
                                }}
                            />

                            <Button
                                variant="contained"
                                onClick={handleTokenSave}
                                disabled={tokenStatus === 'validating'}
                                fullWidth
                                size="large"
                                color={tokenStatus === 'valid' ? 'success' : 'primary'}
                                sx={{ borderRadius: 2, py: 1.5 }}
                            >
                                {tokenStatus === 'validating' ? '🔄 Validating...' :
                                    tokenStatus === 'valid' ? '✅ Token Saved!' :
                                        '🚀 Save & Activate'}
                            </Button>

                            <Paper sx={{ p: 2, bgcolor: '#f8f9fa' }}>
                                <Typography variant="body2" color="text.secondary" mb={1}>
                                    <strong>📝 Quick Setup Tips:</strong>
                                </Typography>
                                <Typography variant="caption" display="block" mb={0.5}>
                                    • Get your API key: <a href="https://platform.openai.com/account/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a>
                                </Typography>
                                <Typography variant="caption" display="block" mb={0.5}>
                                    • Requires GPT-4 and Whisper API access
                                </Typography>
                                <Typography variant="caption" display="block">
                                    • Key is stored securely in your browser only
                                </Typography>
                            </Paper>
                        </Box>
                    </TabPanel>

                    {/* Quick Start Tab */}
                    <TabPanel value={activeTab} index={1}>
                        <Box display="flex" flexDirection="column" gap="16px">
                            <Paper sx={{ p: 2, bgcolor: tokenStatus === 'valid' ? '#e8f5e8' : '#fff3e0' }}>
                                <Typography variant="body2" fontWeight="600" mb={1}>
                                    {tokenStatus === 'valid' ? '🎉 Ready to Go!' : '⚠️ Setup Required'}
                                </Typography>
                                <Typography variant="body2">
                                    {tokenStatus === 'valid'
                                        ? 'Your extension is configured and ready to transcribe emails!'
                                        : 'Please complete setup in the Setup tab first.'}
                                </Typography>
                            </Paper>

                            <Typography variant="body1" fontWeight="600" color="primary.main">
                                How to Use (30 seconds):
                            </Typography>

                            <Box sx={{ pl: 1 }}>
                                <Typography variant="body2" sx={{ mb: 1.5, display: 'flex', alignItems: 'flex-start' }}>
                                    <Box component="span" sx={{
                                        minWidth: '24px', height: '24px', borderRadius: '50%',
                                        backgroundColor: '#1976d2', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '12px', fontWeight: 'bold', mr: 2, mt: 0.25
                                    }}>1</Box>
                                    <Box>
                                        <strong>Open Gmail → Compose</strong><br />
                                        Click the 🎤 <em>Voice Transcribe Email</em> button in toolbar
                                    </Box>
                                </Typography>

                                <Typography variant="body2" sx={{ mb: 1.5, display: 'flex', alignItems: 'flex-start' }}>
                                    <Box component="span" sx={{
                                        minWidth: '24px', height: '24px', borderRadius: '50%',
                                        backgroundColor: '#388e3c', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '12px', fontWeight: 'bold', mr: 2, mt: 0.25
                                    }}>2</Box>
                                    <Box>
                                        <strong>Record Your Email</strong><br />
                                        Speak naturally → Click "Stop & Process"
                                    </Box>
                                </Typography>

                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'flex-start' }}>
                                    <Box component="span" sx={{
                                        minWidth: '24px', height: '24px', borderRadius: '50%',
                                        backgroundColor: '#f57c00', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '12px', fontWeight: 'bold', mr: 2, mt: 0.25
                                    }}>3</Box>
                                    <Box>
                                        <strong>Customize & Insert</strong><br />
                                        Set tone, recipient → Click "Insert Email"
                                    </Box>
                                </Typography>
                            </Box>

                            <Paper sx={{ p: 2, bgcolor: '#e3f2fd' }}>
                                <Typography variant="body2" color="primary.main">
                                    💡 <strong>Pro Tip:</strong> Speak your email structure: "Hi John, [content], Best regards, [your name]" for best results!
                                </Typography>
                            </Paper>

                            {usageStats.totalCount > 0 && (
                                <Paper sx={{ p: 2 }}>
                                    <Typography variant="body2" fontWeight="600" mb={1}>📊 Your Stats:</Typography>
                                    <Typography variant="caption" display="block">Today: {usageStats.todayCount} emails</Typography>
                                    <Typography variant="caption" display="block">Total: {usageStats.totalCount} emails</Typography>
                                    <Typography variant="caption">Avg length: {usageStats.avgLength} words</Typography>
                                </Paper>
                            )}
                        </Box>
                    </TabPanel>

                    {/* Settings Tab */}
                    <TabPanel value={activeTab} index={2}>
                        <Box display="flex" flexDirection="column" gap="12px">
                            <Typography variant="body1" fontWeight="600" mb={1}>⚙️ Preferences</Typography>

                            <FormControlLabel
                                control={<Switch checked={settings.autoDetectNames} onChange={(e) => handleSettingChange('autoDetectNames', e.target.checked)} />}
                                label="Auto-detect names in emails"
                            />

                            <FormControlLabel
                                control={<Switch checked={settings.smartPunctuation} onChange={(e) => handleSettingChange('smartPunctuation', e.target.checked)} />}
                                label="Smart punctuation correction"
                            />

                            <FormControlLabel
                                control={<Switch checked={settings.quickInsert} onChange={(e) => handleSettingChange('quickInsert', e.target.checked)} />}
                                label="Quick insert (skip customization popup)"
                            />

                            <FormControlLabel
                                control={<Switch checked={settings.includeSignature} onChange={(e) => handleSettingChange('includeSignature', e.target.checked)} />}
                                label="Include email signature"
                            />

                            <FormControlLabel
                                control={<Switch checked={settings.enableShortcuts} onChange={(e) => handleSettingChange('enableShortcuts', e.target.checked)} />}
                                label="Enable keyboard shortcuts"
                            />

                            <Divider sx={{ my: 1 }} />

                            <Typography variant="body2" fontWeight="600">Default Email Tone:</Typography>
                            <Box display="flex" gap="8px" flexWrap="wrap">
                                {['professional', 'friendly', 'formal', 'casual'].map((tone) => (
                                    <Chip
                                        key={tone}
                                        label={tone.charAt(0).toUpperCase() + tone.slice(1)}
                                        variant={settings.defaultTone === tone ? 'filled' : 'outlined'}
                                        color={settings.defaultTone === tone ? 'primary' : 'default'}
                                        onClick={() => handleSettingChange('defaultTone', tone)}
                                        size="small"
                                    />
                                ))}
                            </Box>
                        </Box>
                    </TabPanel>

                    {/* Templates Tab */}
                    <TabPanel value={activeTab} index={3}>
                        <Box display="flex" flexDirection="column" gap="12px">
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body1" fontWeight="600">📄 Email Templates</Typography>
                                <Button size="small" onClick={addTemplate} variant="outlined">+ Add</Button>
                            </Box>

                            {templates.length === 0 ? (
                                <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                                    <Typography variant="body2" color="text.secondary">
                                        No templates yet. Create your first template!
                                    </Typography>
                                </Paper>
                            ) : (
                                <List dense>
                                    {templates.map((template) => (
                                        <ListItem key={template.id} divider>
                                            <ListItemText
                                                primary={template.name}
                                                secondary={template.content.substring(0, 50) + '...'}
                                            />
                                            <ListItemSecondaryAction>
                                                <IconButton size="small" onClick={() => deleteTemplate(template.id)}>
                                                    🗑️
                                                </IconButton>
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    ))}
                                </List>
                            )}

                            <Paper sx={{ p: 2, bgcolor: '#f8f9fa' }}>
                                <Typography variant="caption" color="text.secondary">
                                    Templates can be used for common email patterns like follow-ups,
                                    introductions, or meeting requests. Voice "use template [name]" to apply.
                                </Typography>
                            </Paper>
                        </Box>
                    </TabPanel>
                </Box>

                <Snackbar open={openSnackbar} autoHideDuration={4000} onClose={handleCloseSnackbar}>
                    <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
                        {snackbarMessage}
                    </Alert>
                </Snackbar>
            </Box>
        </ThemeProvider>
    );
}

export default App;