/**
 * Gooning.games Chat Archiver - Content Script
 * 
 * This script detects and extracts chat messages from gooning.games,
 * including normal messages, continuations, and task/question cards.
 */

// Configuration
const DEFAULT_SERVER_URL = 'http://localhost:7337';

// Message extraction logic
class ChatArchiver {
  constructor() {
    this.serverUrl = DEFAULT_SERVER_URL;
    this.extractedMessages = [];
  }

  /**
   * Main entry point - extracts all messages from the chat history
   */
  extractAllMessages() {
    const chatHistoryContainer = this.findChatHistoryContainer();
    if (!chatHistoryContainer) {
      console.warn('[ChatArchiver] Chat history container not found');
      return [];
    }

    const messageRows = this.findAllMessageRows(chatHistoryContainer);
    this.extractedMessages = [];

    // Track the last known author for continuation messages
    let lastAuthor = null;
    let lastAuthorId = null;

    for (const row of messageRows) {
      const message = this.parseMessageRow(row, lastAuthor, lastAuthorId);
      if (message) {
        this.extractedMessages.push(message);
        
        // Update last author info for potential continuations
        if (message.author) {
          lastAuthor = message.author;
          lastAuthorId = message.authorId || message.id;
        }
      }
    }

    return this.extractedMessages;
  }

  /**
   * Find the main chat history container
   */
  findChatHistoryContainer() {
    // Try various selectors for the chat history container
    const selectors = [
      'div[class*="chat-history"]',
      'div.chat-history',
      'div[data-chat-history]',
      '.chat-container',
      '[class*="chat"][class*="history"]'
    ];

    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) {
        return container;
      }
    }

    // Fallback: look for a container with message-row children
    const potentialContainers = document.querySelectorAll('div');
    for (const div of potentialContainers) {
      if (div.querySelector('.message-row')) {
        return div;
      }
    }

    return null;
  }

  /**
   * Find all message row elements within the container
   */
  findAllMessageRows(container) {
    // Look for direct children that are message rows
    const messageRows = container.querySelectorAll(':scope > .message-row, :scope > div[id*="uuid"], :scope > div[data-message-id]');
    
    if (messageRows.length === 0) {
      // Fallback: search deeper
      return container.querySelectorAll('.message-row');
    }

    return Array.from(messageRows);
  }

  /**
   * Parse a single message row element
   */
  parseMessageRow(row, lastAuthor, lastAuthorId) {
    const messageId = this.getMessageId(row);
    if (!messageId) {
      return null;
    }

    // Determine message type
    const isContinuation = this.isContinuationMessage(row);
    const isTask = this.isTaskMessage(row);

    if (isTask) {
      return this.parseTaskMessage(row, messageId);
    }

    if (isContinuation) {
      return this.parseContinuationMessage(row, messageId, lastAuthor, lastAuthorId);
    }

    return this.parseNormalMessage(row, messageId);
  }

  /**
   * Get message ID from element
   */
  getMessageId(row) {
    // Check for id attribute (UUID format)
    if (row.id && this.isValidUUID(row.id)) {
      return row.id;
    }

    // Check for data-message-id attribute
    if (row.dataset?.messageId) {
      return row.dataset.messageId;
    }

    // Generate a fallback ID based on content hash
    return 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Check if message is a continuation (lacks profile-area, has mt-1 class)
   */
  isContinuationMessage(row) {
    const profileArea = row.querySelector('.profile-area');
    const hasMt1Class = row.classList.contains('mt-1');
    const hasPlClass = row.querySelector('[class*="pl-"]');

    return !profileArea && (hasMt1Class || hasPlClass);
  }

  /**
   * Check if message is a task/question card
   */
  isTaskMessage(row) {
    return row.classList.contains('task-card') || 
           row.querySelector('.task-container') !== null ||
           row.querySelector('.task-body') !== null;
  }

  /**
   * Parse a normal message with profile area
   */
  parseNormalMessage(row, messageId) {
    const profileArea = row.querySelector('.profile-area');
    const messageContent = row.querySelector('.message-content');

    if (!messageContent) {
      return null;
    }

    const author = profileArea ? this.extractUsername(profileArea) : null;
    const authorId = profileArea ? this.extractAuthorId(profileArea) : null;
    const avatar = profileArea ? this.extractAvatar(profileArea) : null;
    const content = this.extractMessageContent(messageContent);
    const timestamp = this.extractTimestamp(row);

    return {
      id: messageId,
      type: 'normal',
      author: author,
      authorId: authorId,
      avatar: avatar,
      content: content,
      timestamp: timestamp,
      rawHtml: row.outerHTML
    };
  }

  /**
   * Parse a continuation message (no profile area)
   */
  parseContinuationMessage(row, messageId, lastAuthor, lastAuthorId) {
    const messageContent = row.querySelector('.message-content');

    if (!messageContent) {
      return null;
    }

    const content = this.extractMessageContent(messageContent);
    const timestamp = this.extractTimestamp(row);

    return {
      id: messageId,
      type: 'continuation',
      author: lastAuthor,
      authorId: lastAuthorId,
      avatar: null,
      content: content,
      timestamp: timestamp,
      linkedTo: lastAuthorId,
      rawHtml: row.outerHTML
    };
  }

  /**
   * Parse a task/question card message
   */
  parseTaskMessage(row, messageId) {
    const profileArea = row.querySelector('.profile-area');
    const taskContainer = row.querySelector('.task-container');
    const userBadge = row.querySelector('.user-badge');

    // Extract author from user-badge or profile-area
    let author = null;
    let authorId = null;

    if (userBadge) {
      author = userBadge.textContent.trim();
    } else if (profileArea) {
      author = this.extractUsername(profileArea);
      authorId = this.extractAuthorId(profileArea);
    }

    const title = taskContainer?.querySelector('h3')?.textContent.trim() || '';
    const body = taskContainer?.querySelector('.task-body')?.textContent.trim() || 
                 taskContainer?.querySelector('p')?.textContent.trim() || '';
    const timestamp = this.extractTimestamp(row);

    return {
      id: messageId,
      type: 'task',
      author: author,
      authorId: authorId,
      avatar: null,
      title: title,
      content: body,
      timestamp: timestamp,
      rawHtml: row.outerHTML
    };
  }

  /**
   * Extract username from profile area
   */
  extractUsername(profileArea) {
    const usernameEl = profileArea.querySelector('.username');
    if (usernameEl) {
      return usernameEl.textContent.trim();
    }

    // Fallback: look for any text content that might be the username
    const textNodes = Array.from(profileArea.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    
    if (textNodes.length > 0) {
      return textNodes[0].textContent.trim();
    }

    return null;
  }

  /**
   * Extract author ID from profile area or data attributes
   */
  extractAuthorId(profileArea) {
    // Check for data-author attribute on the row or profile area
    const dataAuthor = profileArea.dataset?.author || 
                       profileArea.closest('[data-author]')?.dataset?.author;
    
    if (dataAuthor) {
      return dataAuthor;
    }

    return null;
  }

  /**
   * Extract avatar URL from profile area
   */
  extractAvatar(profileArea) {
    const avatarEl = profileArea.querySelector('.avatar');
    if (avatarEl) {
      return avatarEl.src || avatarEl.dataset?.src || null;
    }

    return null;
  }

  /**
   * Extract message content as plain text
   */
  extractMessageContent(contentEl) {
    // Get all text content, preserving line breaks
    const paragraphs = contentEl.querySelectorAll('p');
    if (paragraphs.length > 0) {
      return Array.from(paragraphs).map(p => p.textContent.trim()).join('\n');
    }

    return contentEl.textContent.trim();
  }

  /**
   * Extract timestamp from message row
   */
  extractTimestamp(row) {
    // Look for timestamp element
    const timestampEl = row.querySelector('[class*="time"], [class*="date"], .timestamp');
    if (timestampEl) {
      return timestampEl.textContent.trim() || new Date().toISOString();
    }

    // Return current time as fallback
    return new Date().toISOString();
  }

  /**
   * Validate UUID format
   */
  isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Send extracted messages to the server
   */
  async sendToServer(messages, serverUrl = null) {
    const url = serverUrl || this.serverUrl;
    
    try {
      const response = await fetch(`${url}/api/chat/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: messages,
          timestamp: new Date().toISOString(),
          source: 'gooning.games'
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[ChatArchiver] Failed to send messages to server:', error);
      throw error;
    }
  }
}

// Initialize the archiver
const archiver = new ChatArchiver();

// Listen for sync requests from popup or other scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sync') {
    try {
      const messages = archiver.extractAllMessages();
      
      // Get server URL from request or use default
      const serverUrl = request.serverUrl || DEFAULT_SERVER_URL;
      
      // Send to server
      archiver.sendToServer(messages, serverUrl)
        .then(response => {
          sendResponse({ 
            success: true, 
            count: messages.length,
            serverResponse: response 
          });
        })
        .catch(error => {
          sendResponse({ 
            success: false, 
            error: error.message,
            count: messages.length
          });
        });
      
      // Return true to indicate we'll send response asynchronously
      return true;
    } catch (error) {
      sendResponse({ 
        success: false, 
        error: error.message,
        count: 0
      });
      return true;
    }
  }

  if (request.action === 'extract') {
    try {
      const messages = archiver.extractAllMessages();
      sendResponse({ 
        success: true, 
        count: messages.length,
        messages: messages 
      });
    } catch (error) {
      sendResponse({ 
        success: false, 
        error: error.message,
        count: 0
      });
    }
    return true;
  }
});

// Export for testing/debugging
window.ChatArchiver = ChatArchiver;
window.archiver = archiver;
