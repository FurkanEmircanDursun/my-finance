import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { ref, uploadBytes, getBytes, getMetadata, getDownloadURL, listAll, updateMetadata, deleteObject } from 'firebase/storage'

if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('Run through firebase emulators:exec --only storage.')
}

let env
const REPORT_A = 'a'.repeat(64)
const REPORT_B = 'b'.repeat(64)
const REPORT_C = 'c'.repeat(64)
const REPORT_D = 'd'.repeat(64)
const LEGACY_PATHS = ['statement.pdf', 'users/owner/statements/synthetic.pdf', 'users/other/private/synthetic.pdf']
const pdfBytes = new TextEncoder().encode('%PDF-1.7\nSynthetic rules-test fixture. No statement data.\n')
const jsonBytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, reportId: REPORT_A }))
const csvBytes = new TextEncoder().encode('Tarih,Aciklama,Tutar\n01/11/2026,ORNEK,100.00\n')

const validMetadata = (sha256, overrides = {}) => ({
  errorCode: 'unsupported_bank',
  reason: 'unsupported_bank',
  appVersion: '2.9.3',
  sha256,
  createdAt: '2026-11-26T14:00:00.000Z',
  ...overrides,
})

const signedIn = (uid, provider = 'google.com') =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } })

const anonymous = (uid = 'anon-user') =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-my-finance-rules',
    storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8') },
  })
  await env.withSecurityRulesDisabled(async (context) => {
    for (const path of LEGACY_PATHS) {
      await uploadBytes(ref(context.storage(), path), pdfBytes, { contentType: 'application/pdf' })
    }
    await uploadBytes(
      ref(context.storage(), `users/owner/failed-statements/${REPORT_D}/source.pdf`),
      pdfBytes,
      { contentType: 'application/pdf', customMetadata: validMetadata(REPORT_D) },
    )
  })
})

after(async () => {
  await env?.clearStorage()
  await env?.cleanup()
})

for (const identity of ['owner', 'other', null]) {
  test(`Storage denies arbitrary/legacy paths for ${identity ?? 'unauthenticated'}`, async () => {
    const context = identity ? signedIn(identity) : env.unauthenticatedContext()
    const storage = context.storage()
    for (const path of LEGACY_PATHS) {
      const object = ref(storage, path)
      await assertFails(getBytes(object))
      await assertFails(getMetadata(object))
      await assertFails(getDownloadURL(object))
      await assertFails(uploadBytes(object, pdfBytes, { contentType: 'application/pdf' }))
      await assertFails(updateMetadata(object, { contentType: 'text/plain' }))
      await assertFails(deleteObject(object))
    }
    await assertFails(listAll(ref(storage)))
    await assertFails(listAll(ref(storage, 'users/owner/failed-statements')))
    await assertFails(listAll(ref(storage, `users/owner/failed-statements/${REPORT_D}`)))
    await assertFails(uploadBytes(ref(storage, `new/${identity ?? 'guest'}.pdf`), pdfBytes))
  })
}

test('Verified owner can create write-once source + report files, but cannot read, list, or overwrite them', async () => {
  const storage = signedIn('owner').storage()
  const pdfRef = ref(storage, `users/owner/failed-statements/${REPORT_A}/source.pdf`)
  const reportRef = ref(storage, `users/owner/failed-statements/${REPORT_A}/report.json`)
  const csvRef = ref(storage, `users/owner/failed-statements/${REPORT_B}/source.csv`)
  const txtRef = ref(storage, `users/owner/failed-statements/${REPORT_C}/source.txt`)

  await assertSucceeds(uploadBytes(pdfRef, pdfBytes, {
    contentType: 'application/pdf',
    customMetadata: validMetadata(REPORT_A),
  }))
  await assertSucceeds(uploadBytes(reportRef, jsonBytes, {
    contentType: 'application/json',
    customMetadata: validMetadata(REPORT_A),
  }))
  await assertSucceeds(uploadBytes(csvRef, csvBytes, {
    contentType: 'text/csv',
    customMetadata: validMetadata(REPORT_B, { errorCode: 'reconciliation', reason: 'skipped_rows' }),
  }))
  await assertSucceeds(uploadBytes(txtRef, csvBytes, {
    contentType: 'text/plain',
    customMetadata: validMetadata(REPORT_C, { errorCode: 'unreadable', reason: 'unreadable_text' }),
  }))

  // Write-once dropbox: even the uploader cannot read, download, list, update metadata, or overwrite.
  await assertFails(getBytes(pdfRef))
  await assertFails(getMetadata(pdfRef))
  await assertFails(getDownloadURL(pdfRef))
  await assertFails(getBytes(reportRef))
  await assertFails(listAll(ref(storage, `users/owner/failed-statements/${REPORT_A}`)))
  await assertFails(updateMetadata(pdfRef, { customMetadata: validMetadata(REPORT_A) }))
  await assertFails(uploadBytes(pdfRef, pdfBytes, {
    contentType: 'application/pdf',
    customMetadata: validMetadata(REPORT_A),
  }))

  // Owner can delete their own known objects (used for user-requested removal & account deletion).
  await assertSucceeds(deleteObject(pdfRef))
  await assertSucceeds(deleteObject(reportRef))
})

test('Rejects cross-user, anonymous, and unauthenticated creates and deletes', async () => {
  const path = `users/owner/failed-statements/${REPORT_D}/source.pdf`
  const newPath = `users/owner/failed-statements/${'e'.repeat(64)}/source.pdf`
  const opts = { contentType: 'application/pdf', customMetadata: validMetadata('e'.repeat(64)) }

  for (const ctx of [signedIn('other'), anonymous('owner'), env.unauthenticatedContext()]) {
    const storage = ctx.storage()
    await assertFails(uploadBytes(ref(storage, newPath), pdfBytes, opts))
    await assertFails(deleteObject(ref(storage, path)))
    await assertFails(getBytes(ref(storage, path)))
    await assertFails(listAll(ref(storage, 'users/owner/failed-statements')))
  }
})

test('Rejects malformed paths, disallowed filenames, wrong MIME types, invalid metadata, and oversized JSON', async () => {
  const storage = signedIn('owner').storage()
  const badId = 'not-a-sha256'
  const freshId = 'f'.repeat(64)

  // Invalid reportId
  await assertFails(uploadBytes(ref(storage, `users/owner/failed-statements/${badId}/source.pdf`), pdfBytes, {
    contentType: 'application/pdf',
    customMetadata: validMetadata(badId),
  }))

  // Disallowed filename
  await assertFails(uploadBytes(ref(storage, `users/owner/failed-statements/${freshId}/payload.exe`), pdfBytes, {
    contentType: 'application/pdf',
    customMetadata: validMetadata(freshId),
  }))

  // MIME mismatch (HTML uploaded as source.pdf)
  await assertFails(uploadBytes(ref(storage, `users/owner/failed-statements/${freshId}/source.pdf`), pdfBytes, {
    contentType: 'text/html',
    customMetadata: validMetadata(freshId),
  }))

  // Empty payload
  await assertFails(uploadBytes(ref(storage, `users/owner/failed-statements/${freshId}/source.pdf`), new Uint8Array(0), {
    contentType: 'application/pdf',
    customMetadata: validMetadata(freshId),
  }))

  // Metadata sha256 mismatch
  await assertFails(uploadBytes(ref(storage, `users/owner/failed-statements/${freshId}/source.pdf`), pdfBytes, {
    contentType: 'application/pdf',
    customMetadata: validMetadata('1'.repeat(64)),
  }))

  // Unexpected extra metadata key
  await assertFails(uploadBytes(ref(storage, `users/owner/failed-statements/${freshId}/source.pdf`), pdfBytes, {
    contentType: 'application/pdf',
    customMetadata: validMetadata(freshId, { injected: 'bad' }),
  }))

  // Invalid errorCode enum
  await assertFails(uploadBytes(ref(storage, `users/owner/failed-statements/${freshId}/source.pdf`), pdfBytes, {
    contentType: 'application/pdf',
    customMetadata: validMetadata(freshId, { errorCode: 'different_holder' }),
  }))

  // Oversized report.json (> 256 KiB)
  const bigJson = new Uint8Array(256 * 1024 + 10).fill(0x20)
  await assertFails(uploadBytes(ref(storage, `users/owner/failed-statements/${freshId}/report.json`), bigJson, {
    contentType: 'application/json',
    customMetadata: validMetadata(freshId),
  }))
})
