import test from 'node:test';
import assert from 'node:assert/strict';
import {customerVisibleMessages} from '../customerOperationsPrivacy.js';
import type {CustomerOperationsConversationMessage} from '../src/types/customerOperations.js';
test('customer response excludes notes, undelivered email and private metadata even when mixed into query results',()=>{
  const base:CustomerOperationsConversationMessage={id:'m',conversationId:'c',authorType:'staff',authorEmail:'private@example.com',visibility:'customer',channel:'in_app',deliveryStatus:'not_applicable',deliveryError:'private SMTP details',externalMessageId:'provider-secret',body:'Hello',createdAt:'2026-01-01'};
  const messages=customerVisibleMessages([base,{...base,id:'note',visibility:'internal',body:'Internal note'},{...base,id:'failed',channel:'email',deliveryStatus:'failed'},{...base,id:'pending',channel:'email',deliveryStatus:'pending'},{...base,id:'sent',channel:'email',deliveryStatus:'sent'}]);
  assert.deepEqual(messages.map(m=>m.id),['m','sent']);assert.ok(messages.every(m=>m.authorEmail===null&&m.deliveryError===null&&m.externalMessageId===null));assert.ok(!JSON.stringify(messages).includes('Internal note'));assert.ok(!JSON.stringify(messages).includes('private@example.com'));
});
