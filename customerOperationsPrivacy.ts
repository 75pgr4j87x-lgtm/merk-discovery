import type { CustomerOperationsConversationMessage } from './src/types/customerOperations.js';

// Explicit allowlist at the customer response boundary, independent of DB filters.
export function customerVisibleMessages(messages: CustomerOperationsConversationMessage[]) {
  return messages.filter(message => message.visibility === 'customer'
    && (message.channel !== 'email' || message.deliveryStatus === 'sent'))
    .map(message => ({
      id: message.id, conversationId: message.conversationId,
      authorType: message.authorType, authorEmail: null,
      visibility: message.visibility, channel: message.channel,
      deliveryStatus: message.deliveryStatus, deliveryError: null,
      externalMessageId: null, attachments: message.attachments || [], body: message.body, createdAt: message.createdAt,
    }));
}
