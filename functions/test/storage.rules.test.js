import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing'
import { ref, uploadBytes, getBytes, getMetadata, getDownloadURL, listAll, updateMetadata, deleteObject } from 'firebase/storage'

if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('Run through firebase emulators:exec --only firestore,storage.')
}
let env
const objectPaths = ['statement.pdf', 'users/owner/statements/synthetic.pdf', 'users/other/private/synthetic.pdf']
const bytes = new TextEncoder().encode('Synthetic rules-test fixture. No statement data.')
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-my-finance-rules',
    storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8') },
  })
  // Successful bypass seeding ensures denied reads/deletes target real objects.
  await env.withSecurityRulesDisabled(async context => {
    for (const path of objectPaths) await uploadBytes(ref(context.storage(), path), bytes, { contentType: 'application/pdf' })
  })
})
after(async () => { await env?.clearStorage(); await env?.cleanup() })

for (const identity of ['owner', 'other', null]) {
  test(`Storage denies existing-object reads, lists and mutations for ${identity ?? 'unauthenticated'}`, async () => {
    const context = identity ? env.authenticatedContext(identity) : env.unauthenticatedContext()
    const storage = context.storage()
    for (const path of objectPaths) {
      const object = ref(storage, path)
      await assertFails(getBytes(object))
      await assertFails(getMetadata(object))
      await assertFails(getDownloadURL(object))
      await assertFails(uploadBytes(object, bytes))
      await assertFails(updateMetadata(object, { contentType: 'text/plain' }))
      await assertFails(deleteObject(object))
    }
    await assertFails(listAll(ref(storage)))
    await assertFails(listAll(ref(storage, 'users/owner/statements')))
    await assertFails(uploadBytes(ref(storage, `new/${identity ?? 'guest'}.pdf`), bytes))
  })
}
