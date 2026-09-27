import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { chatNotificationTarget } from '../src/lib/chat-helpers.ts';
const message = { type: 'CHAT_MESSAGE', delivery: 'chat_local_v1', conversationId: 'chat1', messageId: 'msg1', recipientId: 'user1', sequence: 5, previewTitle: 'Praveen', previewBody: 'Hello' };
function fixture({ user = 'user1', presented = [], appState = 'background', failReport = false } = {}) {
 const stored = new Map([['session', JSON.stringify({token:'token',user:{id:user}})]]);
 const notices = [], dismissed = [], reports = [];
 const deps = {
  'expo-notifications': { scheduleNotificationAsync: async n => { notices.push(n); presented.push({request:{identifier:n.identifier,content:n.content}}); }, getPresentedNotificationsAsync: async () => presented, dismissNotificationAsync: async id => dismissed.push(id) },
  'expo-secure-store': { getItemAsync: async k => stored.get(k) ?? null, setItemAsync: async (k,v) => stored.set(k,v) },
  '@/api/auth': { SESSION_STORAGE_KEY:'session', isSession:s=>!!s?.token },
  '@/api/chat': { isRecord:v=>!!v && typeof v==='object', markDelivered: async (...args) => { reports.push(args); if (failReport) throw new Error('offline'); } },
  'react-native': { AppState: { currentState: appState } },
  '@/api/token': { tokenExpiresAt:()=>Date.now()+60000 },
  '@/lib/chat-helpers': { chatNotificationTarget },
  '@/lib/chat-notification-actions': { CHAT_CATEGORY:'chat_message', registerChatCategory:async()=>{} },
 };
 const cleanup={};
 new Function('require','exports',ts.transpile(readFileSync(new URL('../src/lib/chat-notification-cleanup.ts',import.meta.url),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(n=>deps[n],cleanup);
 deps['@/lib/chat-notification-cleanup']=cleanup;
 const exports={};
 new Function('require','exports',ts.transpile(readFileSync(new URL('../src/lib/chat-notification-delivery.ts',import.meta.url),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(n=>deps[n],exports);
 return {...exports, notices,dismissed,stored,reports};
}
test('raw Android data push becomes a local notification with category and actionable data', async()=>{
 const f=fixture(); await f.presentChatDelivery({data:{dataString:JSON.stringify(message)}});
 assert.equal(f.notices.length,1);
 assert.equal(f.notices[0].content.categoryIdentifier,'chat_message');
 assert.equal(f.notices[0].content.title,'Praveen');
 assert.equal(f.notices[0].content.data.sequence,5);
 assert.equal(f.notices[0].content.data.delivery,undefined);
 assert.equal(f.parseChatDelivery({actionIdentifier:'reply',data:message}),null);
});
test('cleanup preserves other chats, other accounts and newer unread messages',async()=>{
 const alert=(id,extra)=>({request:{identifier:id,content:{data:{...message,...extra}}}});
 const f=fixture({presented:[alert('old',{}),alert('new',{sequence:6}),alert('other-chat',{conversationId:'chat2'}),alert('other-user',{recipientId:'user2'})]});
 await f.clearReadChatNotifications('user1','chat1',5);
 assert.deepEqual(f.dismissed,['old']);
 await f.presentChatDelivery({data:message});
 assert.equal(f.notices.length,0);
 await f.clearReadChatNotifications('user1','chat1',3);
 assert.equal(f.stored.get('chat-read.user1.chat1'),'5');
});
test('wrong account, malformed payload and local notifications are ignored',async()=>{
 const f=fixture({user:'user2'});
 for(const payload of [{data:message},{data:{dataString:'broken'}},{data:{...message,sequence:-1}},{data:{...message,delivery:undefined}}]) await f.presentChatDelivery(payload);
 assert.equal(f.notices.length,0);
});
test('delivery racing with a read is removed, and a read racing with delivery suppresses it',async()=>{
 const f=fixture();
 await Promise.all([f.clearReadChatNotifications('user1','chat1',5), f.presentChatDelivery({data:message})]);
 assert.equal(f.notices.length,0);
});

test('read queued after delivery removes the notification just presented',async()=>{
 const f=fixture();
 await Promise.all([f.presentChatDelivery({data:message}),f.clearReadChatNotifications('user1','chat1',5)]);
 assert.deepEqual(f.dismissed,[f.notices[0].identifier]);
});

test('a push that wakes a closed app reports the delivery as the saved user', async()=>{
 const f=fixture(); await f.presentChatDelivery({data:{dataString:JSON.stringify(message)}});
 assert.deepEqual(f.reports,[['token','chat1',5]]);
 assert.equal(f.notices.length,1);
});
test('an open app leaves the report to the chat store, and a failed report still shows the notification',async()=>{
 const open=fixture({appState:'active'}); await open.presentChatDelivery({data:message});
 assert.equal(open.reports.length,0);
 const offline=fixture({failReport:true}); await offline.presentChatDelivery({data:message});
 assert.equal(offline.reports.length,1);
 assert.equal(offline.notices.length,1);
});
test('nothing is reported for another account, a malformed push, or a message already read',async()=>{
 const stranger=fixture({user:'user2'}); await stranger.presentChatDelivery({data:message});
 const broken=fixture(); await broken.presentChatDelivery({data:{...message,sequence:-1}});
 const read=fixture(); await read.clearReadChatNotifications('user1','chat1',5); await read.presentChatDelivery({data:message});
 assert.equal(stranger.reports.length+broken.reports.length+read.reports.length,0);
});
