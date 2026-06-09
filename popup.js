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
  const previewAreaEl = document.getElementById('previewArea');
  
  // State
  let allMessages = [];
  let profiles = {};
  let selectedProfile = null;

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

      // Request all messages from content script
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });

      if (response.success) {
        allMessages = response.messages || [];
        processProfiles(allMessages);
        renderProfileList();
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
      
      // Show preview
      previewAreaEl.textContent = chatHistory.substring(0, 500) + (chatHistory.length > 500 ? '\n\n... (truncated)' : '');
      previewAreaEl.style.display = 'block';
    }).catch(err => {
      console.error('Copy failed:', err);
      showStatus('error', 'Failed to copy to clipboard');
    });
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
        showStatus('success', `Successfully synced ${response.count} messages!`);
        statsEl.style.display = 'block';
        messageCountEl.textContent = response.count;
        
        // Also update local messages for profile browsing
        const extractResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
        if (extractResponse.success) {
          allMessages = extractResponse.messages || [];
          processProfiles(allMessages);
          if (Object.keys(profiles).length > 0) {
            renderProfileList();
          }
        }
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
          messages: []
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
      
      itemEl.innerHTML = `
        <span class="profile-name">${escapeHtml(profile.name)}</span>
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
   * Select a profile and show its actions
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
    
    // Show preview of first message
    const profile = profiles[profileKey];
    if (profile && profile.messages.length > 0) {
      const firstMsg = profile.messages[0];
      const preview = firstMsg.title 
        ? `[${firstMsg.type}] ${firstMsg.title}: ${firstMsg.content}`
        : `[${firstMsg.type}] ${firstMsg.content}`;
      previewAreaEl.textContent = preview.substring(0, 200) + (preview.length > 200 ? '...' : '');
      previewAreaEl.style.display = 'block';
    }
  }

  /**
   * Format chat history for clipboard
   */
  function formatChatHistory(profileKey) {
    const profile = profiles[profileKey];
    if (!profile) return '';
    
    const lines = [];
    lines.push(`Chat History for: ${profile.name}`);
    lines.push(`Total Messages: ${profile.messages.length}`);
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
