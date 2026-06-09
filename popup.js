/**
 * Popup script for Chat Archiver extension
 */

document.addEventListener('DOMContentLoaded', () => {
  const syncBtn = document.getElementById('syncBtn');
  const statusEl = document.getElementById('status');
  const statsEl = document.getElementById('stats');
  const messageCountEl = document.getElementById('messageCount');
  const serverUrlInput = document.getElementById('serverUrl');
  
  // Profile browsing elements
  const loadProfilesBtn = document.getElementById('loadProfilesBtn');
  const profileListEl = document.getElementById('profileList');
  const noProfilesMsgEl = document.getElementById('noProfilesMsg');
  const profileActionsEl = document.getElementById('profileActions');
  const copyChatBtn = document.getElementById('copyChatBtn');
  const editProfileBtn = document.getElementById('editProfileBtn');
  const messagesContainerEl = document.getElementById('messagesContainer');
  const clearStorageBtn = document.getElementById('clearStorageBtn');
  
  // Manual import elements
  const importTextarea = document.getElementById('importTextarea');
  const importBtn = document.getElementById('importBtn');
  
  // Profile editor modal elements
  const profileModal = document.getElementById('profileModal');
  const editAliasInput = document.getElementById('editAlias');
  const editTagsInput = document.getElementById('editTags');
  const editGenderInput = document.getElementById('editGender');
  const editAgeInput = document.getElementById('editAge');
  const editKinksInput = document.getElementById('editKinks');
  const editNotesInput = document.getElementById('editNotes');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const cancelProfileBtn = document.getElementById('cancelProfileBtn');
  
  // State
  let allMessages = [];
  let profiles = {};
  let selectedProfile = null;

  // Load stored messages on popup open
  loadStoredMessages();
  
  async function loadStoredMessages() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url.includes('gooning.games')) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStoredMessages' });
        if (response.success && response.messages) {
          allMessages = response.messages;
          updateStatsDisplay(allMessages.length);
          processProfiles(allMessages);
          if (Object.keys(profiles).length > 0) {
            renderProfileList();
          }
        }
      }
    } catch (error) {
      console.log('Could not load stored messages (may not be on gooning.games)');
    }
  }

  // Clear all stored data
  clearStorageBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all stored chat history? This cannot be undone.')) {
      chrome.storage.local.remove(['archivedMessages', 'lastSyncTime'], () => {
        showStatus('success', 'All chat data cleared!');
        allMessages = [];
        profiles = {};
        selectedProfile = null;
        profileListEl.style.display = 'none';
        profileListEl.innerHTML = '';
        noProfilesMsgEl.style.display = 'block';
        profileActionsEl.style.display = 'none';
        messagesContainerEl.style.display = 'none';
        updateStatsDisplay(0);
      });
    }
  });

  // Load saved server URL from storage
  chrome.storage.sync.get(['serverUrl'], (result) => {
    if (result.serverUrl) {
      serverUrlInput.value = result.serverUrl;
    }
  });

  // Save server URL when changed
  serverUrlInput.addEventListener('change', () => {
    chrome.storage.sync.set({ serverUrl: serverUrlInput.value });
  });

  // Load profiles from chat
  loadProfilesBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        throw new Error('No active tab found');
      }

      if (!tab.url.includes('gooning.games')) {
        showStatus('error', 'Please navigate to gooning.games to load profiles');
        return;
      }

      // First extract current messages from page
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });

      if (response.success) {
        const currentMessages = response.messages || [];
        
        // Also get stored messages and merge
        const storedResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getStoredMessages' });
        let storedMessages = [];
        if (storedResponse.success) {
          storedMessages = storedResponse.messages || [];
        }
        
        // Merge current and stored messages, avoiding duplicates
        const messageMap = new Map();
        for (const msg of [...storedMessages, ...currentMessages]) {
          messageMap.set(msg.id, msg);
        }
        
        allMessages = Array.from(messageMap.values());
        processProfiles(allMessages);
        renderProfileList();
        updateStatsDisplay(allMessages.length);
      } else {
        throw new Error(response.error || 'Failed to extract messages');
      }
    } catch (error) {
      console.error('Load profiles error:', error);
      
      if (error.message.includes('Could not establish connection')) {
        showStatus('info', 'Please refresh the page and try again');
      } else {
        showStatus('error', error.message);
      }
    }
  });

  // Copy selected profile's chat history
  copyChatBtn.addEventListener('click', () => {
    if (!selectedProfile || !profiles[selectedProfile]) {
      showStatus('error', 'No profile selected');
      return;
    }

    const chatHistory = formatChatHistory(selectedProfile);
    
    navigator.clipboard.writeText(chatHistory).then(() => {
      showStatus('success', `Copied ${profiles[selectedProfile].messages.length} messages to clipboard!`);
    }).catch(err => {
      console.error('Copy failed:', err);
      showStatus('error', 'Failed to copy to clipboard');
    });
  });

  // Edit profile button
  editProfileBtn.addEventListener('click', () => {
    if (!selectedProfile || !profiles[selectedProfile]) {
      showStatus('error', 'No profile selected');
      return;
    }
    
    openProfileEditor(selectedProfile);
  });

  // Save profile button
  saveProfileBtn.addEventListener('click', () => {
    if (!selectedProfile) {
      showStatus('error', 'No profile selected');
      return;
    }
    
    const profileData = {
      alias: editAliasInput.value.trim(),
      tags: editTagsInput.value.split(',').map(t => t.trim()).filter(t => t),
      gender: editGenderInput.value.trim(),
      age: editAgeInput.value ? parseInt(editAgeInput.value) : null,
      kinks: editKinksInput.value.trim(),
      notes: editNotesInput.value.trim()
    };
    
    // Save to chrome storage
    const storageKey = `profile_${selectedProfile}`;
    chrome.storage.local.set({ [storageKey]: profileData }, () => {
      // Update local profiles object
      if (!profiles[selectedProfile].customData) {
        profiles[selectedProfile].customData = {};
      }
      Object.assign(profiles[selectedProfile].customData, profileData);
      
      showStatus('success', 'Profile saved!');
      closeProfileEditor();
    });
  });

  // Cancel profile edit
  cancelProfileBtn.addEventListener('click', () => {
    closeProfileEditor();
  });

  // Close modal when clicking outside
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) {
      closeProfileEditor();
    }
  });

  // Manual import button
  importBtn.addEventListener('click', () => {
    const text = importTextarea.value.trim();
    if (!text) {
      showStatus('error', 'Please paste some text to import');
      return;
    }
    
    const importedMessages = parseImportedText(text);
    if (importedMessages.length === 0) {
      showStatus('error', 'No valid messages found in the pasted text');
      return;
    }
    
    // Add to allMessages
    allMessages = [...allMessages, ...importedMessages];
    
    // Re-process profiles
    processProfiles(allMessages);
    renderProfileList();
    updateStatsDisplay(allMessages.length);
    
    // Clear textarea
    importTextarea.value = '';
    
    showStatus('success', `Imported ${importedMessages.length} messages!`);
  });

  syncBtn.addEventListener('click', async () => {
    const serverUrl = serverUrlInput.value.trim() || 'http://localhost:7337';
    
    // Update UI to syncing state
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    syncBtn.classList.add('syncing');
    hideStatus();

    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        throw new Error('No active tab found');
      }

      // Check if we're on gooning.games
      if (!tab.url.includes('gooning.games')) {
        showStatus('error', 'Please navigate to gooning.games to sync chat');
        return;
      }

      // Send sync message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'sync',
        serverUrl: serverUrl
      });

      if (response.success) {
        showStatus('success', `Successfully synced ${response.count} messages to browser storage!`);
        statsEl.style.display = 'block';
        messageCountEl.textContent = response.count;
        
        // Update local messages for profile browsing
        allMessages = response.messages || [];
        processProfiles(allMessages);
        renderProfileList();
      } else {
        showStatus('error', response.error || 'Failed to sync messages');
      }
    } catch (error) {
      console.error('Sync error:', error);
      
      // Handle case where content script is not loaded
      if (error.message.includes('Could not establish connection')) {
        showStatus('info', 'Please refresh the page and try again');
      } else {
        showStatus('error', error.message);
      }
    } finally {
      // Reset button state
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Chat';
      syncBtn.classList.remove('syncing');
    }
  });

  function showStatus(type, message) {
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
  }

  function hideStatus() {
    statusEl.className = 'status';
    statusEl.style.display = 'none';
  }

  function updateStatsDisplay(count) {
    statsEl.style.display = 'block';
    messageCountEl.textContent = count;
  }

  /**
   * Process messages to build profile map
   */
  function processProfiles(messages) {
    profiles = {};
    
    for (const msg of messages) {
      if (!msg.author) continue;
      
      const authorKey = msg.author;
      
      if (!profiles[authorKey]) {
        profiles[authorKey] = {
          name: msg.author,
          authorId: msg.authorId,
          avatar: msg.avatar,
          messages: [],
          customData: null
        };
      }
      
      profiles[authorKey].messages.push({
        id: msg.id,
        type: msg.type,
        content: msg.content,
        title: msg.title,
        timestamp: msg.timestamp
      });
    }
    
    // Load custom data for each profile from storage
    Object.keys(profiles).forEach(key => {
      const storageKey = `profile_${key}`;
      chrome.storage.local.get([storageKey], (result) => {
        if (result[storageKey]) {
          profiles[key].customData = result[storageKey];
        }
      });
    });
  }

  /**
   * Render the profile list in the popup
   */
  function renderProfileList() {
    const profileKeys = Object.keys(profiles);
    
    if (profileKeys.length === 0) {
      profileListEl.style.display = 'none';
      noProfilesMsgEl.style.display = 'block';
      profileActionsEl.style.display = 'none';
      messagesContainerEl.style.display = 'none';
      return;
    }
    
    noProfilesMsgEl.style.display = 'none';
    profileListEl.style.display = 'block';
    profileListEl.innerHTML = '';
    
    // Sort profiles by message count (descending)
    profileKeys.sort((a, b) => profiles[b].messages.length - profiles[a].messages.length);
    
    for (const key of profileKeys) {
      const profile = profiles[key];
      const itemEl = document.createElement('div');
      itemEl.className = 'profile-item';
      itemEl.dataset.profile = key;
      
      // Show custom alias if available
      const displayName = profile.customData?.alias || profile.name;
      
      itemEl.innerHTML = `
        <span class="profile-name">${escapeHtml(displayName)}</span>
        <span class="message-count">${profile.messages.length}</span>
      `;
      
      itemEl.addEventListener('click', () => selectProfile(key));
      
      profileListEl.appendChild(itemEl);
    }
    
    // Select first profile by default
    if (profileKeys.length > 0) {
      selectProfile(profileKeys[0]);
    }
  }

  /**
   * Select a profile and show its messages
   */
  function selectProfile(profileKey) {
    // Remove previous selection
    const prevSelected = profileListEl.querySelector('.profile-item.selected');
    if (prevSelected) {
      prevSelected.classList.remove('selected');
    }
    
    // Add new selection
    const newItem = profileListEl.querySelector(`[data-profile="${profileKey}"]`);
    if (newItem) {
      newItem.classList.add('selected');
    }
    
    selectedProfile = profileKey;
    profileActionsEl.style.display = 'flex';
    
    // Show messages in scrollable container
    const profile = profiles[profileKey];
    if (profile && profile.messages.length > 0) {
      renderMessages(profile);
    }
  }

  /**
   * Render messages for selected profile
   */
  function renderMessages(profile) {
    messagesContainerEl.innerHTML = '';
    messagesContainerEl.style.display = 'block';
    
    for (const msg of profile.messages) {
      const msgEl = document.createElement('div');
      msgEl.className = 'message-item';
      
      const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      
      msgEl.innerHTML = `
        <span class="message-author">${escapeHtml(profile.name)}</span>
        <span class="message-time">${timeStr}</span>
        <div class="message-content">${escapeHtml(msg.content)}</div>
      `;
      
      messagesContainerEl.appendChild(msgEl);
    }
  }

  /**
   * Open profile editor modal
   */
  function openProfileEditor(profileKey) {
    const profile = profiles[profileKey];
    if (!profile) return;
    
    // Fill in existing data if available
    editAliasInput.value = profile.customData?.alias || profile.name;
    editTagsInput.value = profile.customData?.tags?.join(', ') || '';
    editGenderInput.value = profile.customData?.gender || '';
    editAgeInput.value = profile.customData?.age || '';
    editKinksInput.value = profile.customData?.kinks || '';
    editNotesInput.value = profile.customData?.notes || '';
    
    profileModal.classList.add('active');
  }

  /**
   * Close profile editor modal
   */
  function closeProfileEditor() {
    profileModal.classList.remove('active');
  }

  /**
   * Parse imported text into messages
   */
  function parseImportedText(text) {
    const messages = [];
    const lines = text.split('\n');
    
    // Regex to match username followed by time (e.g., "femmygb5:08 PM")
    const userTimeRegex = /^([a-zA-Z0-9_]+)(\d{1,2}:\d{2}\s*(?:AM|PM)?)$/i;
    
    let currentAuthor = null;
    let currentTime = null;
    let currentContent = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const match = line.match(userTimeRegex);
      
      if (match) {
        // Save previous message if exists
        if (currentAuthor && currentContent.length > 0) {
          messages.push({
            id: `imported_${Date.now()}_${messages.length}`,
            author: currentAuthor,
            authorId: currentAuthor.toLowerCase(),
            content: currentContent.join(' '),
            type: 'message',
            timestamp: new Date().toISOString()
          });
        }
        
        // Start new message
        currentAuthor = match[1];
        currentTime = match[2];
        currentContent = [];
      } else {
        // This is message content
        if (currentAuthor) {
          currentContent.push(line);
        }
      }
    }
    
    // Don't forget the last message
    if (currentAuthor && currentContent.length > 0) {
      messages.push({
        id: `imported_${Date.now()}_${messages.length}`,
        author: currentAuthor,
        authorId: currentAuthor.toLowerCase(),
        content: currentContent.join(' '),
        type: 'message',
        timestamp: new Date().toISOString()
      });
    }
    
    return messages;
  }

  /**
   * Format chat history for clipboard
   */
  function formatChatHistory(profileKey) {
    const profile = profiles[profileKey];
    if (!profile) return '';
    
    const lines = [];
    const displayName = profile.customData?.alias || profile.name;
    
    lines.push(`Chat History for: ${displayName}`);
    lines.push(`Total Messages: ${profile.messages.length}`);
    
    // Include custom data if available
    if (profile.customData) {
      lines.push('');
      lines.push('--- Profile Info ---');
      if (profile.customData.tags?.length) {
        lines.push(`Tags: ${profile.customData.tags.join(', ')}`);
      }
      if (profile.customData.gender) {
        lines.push(`Gender: ${profile.customData.gender}`);
      }
      if (profile.customData.age) {
        lines.push(`Age: ${profile.customData.age}`);
      }
      if (profile.customData.kinks) {
        lines.push(`Kinks/Interests: ${profile.customData.kinks}`);
      }
      if (profile.customData.notes) {
        lines.push(`Notes: ${profile.customData.notes}`);
      }
    }
    
    lines.push('='.repeat(50));
    lines.push('');
    
    for (const msg of profile.messages) {
      const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Unknown time';
      
      if (msg.type === 'task') {
        lines.push(`[${timestamp}] [TASK] ${msg.title || 'Untitled Task'}`);
        lines.push(msg.content);
      } else if (msg.type === 'continuation') {
        lines.push(`[${timestamp}] (cont.) ${msg.content}`);
      } else {
        lines.push(`[${timestamp}] ${msg.content}`);
      }
      
      lines.push('---');
    }
    
    return lines.join('\n');
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
