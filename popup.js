/**
 * Popup script for Chat Archiver extension
 */

document.addEventListener('DOMContentLoaded', () => {
  const syncBtn = document.getElementById('syncBtn');
  const statusEl = document.getElementById('status');
  const statsEl = document.getElementById('stats');
  const messageCountEl = document.getElementById('messageCount');
  const serverUrlInput = document.getElementById('serverUrl');

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
});
