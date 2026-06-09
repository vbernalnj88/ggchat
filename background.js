/**
 * Background service worker for Chat Archiver extension
 */

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Chat Archiver installed:', details.reason);
  
  // Set default server URL in storage
  chrome.storage.sync.set({ 
    serverUrl: 'http://localhost:7337',
    lastSyncTime: null,
    totalMessagesArchived: 0
  });
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getServerUrl') {
    chrome.storage.sync.get(['serverUrl'], (result) => {
      sendResponse({ serverUrl: result.serverUrl || 'http://localhost:7337' });
    });
    return true; // Indicates async response
  }

  if (request.action === 'updateStats') {
    chrome.storage.sync.get(['totalMessagesArchived'], (result) => {
      const newTotal = (result.totalMessagesArchived || 0) + request.count;
      chrome.storage.sync.set({ 
        totalMessagesArchived: newTotal,
        lastSyncTime: new Date().toISOString()
      });
      sendResponse({ success: true, total: newTotal });
    });
    return true;
  }
});
