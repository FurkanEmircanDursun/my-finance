import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverOnce, deliveryId, dueReminders, istanbulDate, messageFor } from '../src/reminder-plan.js'

const card = { id: 'card-a', bank: 'akbank', name: 'PRIVATE CARD NAME', statementDay: 31, entryDay: 29, remindersEnabled: true }
const device = { enabled: true, hour: 9, timeZone: 'Europe/Istanbul' }
const at = new Date('2027-02-28T06:00:00Z')

test('short February combines different configured days on the last day', () => {
  assert.equal(dueReminders({ cards: [card] }, device, at)[0].kind, 'combined')
  assert.equal(dueReminders({ cards: [card] }, device, at).length, 1)
})
test('leap February clamps to the 29th', () => {
  assert.equal(dueReminders({ cards: [card] }, device, new Date('2028-02-28T06:00:00Z')).length, 0)
  assert.equal(dueReminders({ cards: [card] }, device, new Date('2028-02-29T06:00:00Z')).length, 1)
})
test('Istanbul date survives UTC midnight and uses 24 hour clock', () => {
  assert.deepEqual(istanbulDate(new Date('2026-11-06T21:00:00Z')), { year: 2026, month: 11, day: 7, hour: 0 })
})
test('disabled devices, cards, wrong hours and deleted profiles never deliver', () => {
  assert.equal(dueReminders({ cards: [card] }, { ...device, enabled: false }, at).length, 0)
  assert.equal(dueReminders({ cards: [{ ...card, remindersEnabled: false }] }, device, at).length, 0)
  assert.equal(dueReminders({ cards: [card] }, { ...device, hour: 10 }, at).length, 0)
  assert.equal(dueReminders({ cards: [card], _d: true }, device, at).length, 0)
})
test('untrusted malformed card days and timezone are ignored', () => {
  assert.equal(dueReminders({ cards: [{ ...card, statementDay: '28', entryDay: 99 }] }, device, at).length, 0)
  assert.equal(dueReminders({ cards: [card] }, { ...device, timeZone: 'America/New_York' }, at).length, 0)
  assert.equal(dueReminders({ cards: [null, { ...card, bank: 'fake' }] }, device, at).length, 0)
})
test('each card appears once and monthly IDs are deterministic and device scoped', () => {
  const reminders = dueReminders({ cards: [card, card] }, device, at)
  assert.equal(reminders.length, 1)
  assert.equal(deliveryId('users/a/pushDevices/a', reminders[0]), deliveryId('users/a/pushDevices/a', reminders[0]))
  assert.notEqual(deliveryId('users/a/pushDevices/a', reminders[0]), deliveryId('users/a/pushDevices/b', reminders[0]))
})
test('lock screen preview contains no card name, bank or financial amount', () => {
  const reminder = dueReminders({ cards: [card] }, device, at)[0]
  const message = messageFor('TOKEN', reminder, 'ID')
  assert.equal(JSON.stringify(message).includes(card.name), false)
  assert.equal(JSON.stringify(message).includes('akbank'), false)
  assert.equal(message.android.notification.visibility, 'private')
  assert.equal(message.android.notification.tag, 'ID')
  assert.equal(message.data.cardId, card.id)
})
test('duplicate invocation never calls FCM', async () => {
  let sent = false
  const result = await deliverOnce({ claim: async () => false, send: async () => { sent = true } }, 'id', {})
  assert.equal(result, 'duplicate')
  assert.equal(sent, false)
})
test('claimed successful delivery is acknowledged once', async () => {
  const events = []
  assert.equal(await deliverOnce({
    claim: async () => { events.push('claim'); return true }, send: async () => { events.push('send') },
    finish: async (_id, status) => { events.push(status) },
  }, 'id', {}), 'sent')
  assert.deepEqual(events, ['claim', 'send', 'sent'])
})
test('invalid tokens are removed and ambiguous errors retain dedup receipt', async () => {
  const events = []
  await deliverOnce({
    claim: async () => true,
    send: async () => { throw { code: 'messaging/registration-token-not-registered' } },
    invalidate: async () => { events.push('invalidated') }, finish: async (_id, status) => { events.push(status) },
  }, 'id', {})
  assert.deepEqual(events, ['invalidated', 'failed'])
})
