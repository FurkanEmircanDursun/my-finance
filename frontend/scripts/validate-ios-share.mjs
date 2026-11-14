import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import xcode from 'xcode'
import plist from 'simple-plist'

const base = new URL('../ios/App/', import.meta.url)
const path = (relative) => fileURLToPath(new URL(relative, base))
const project = xcode.project(path('App.xcodeproj/project.pbxproj')); project.parseSync()
const objects = project.hash.project.objects
const unquote = (value) => String(value ?? '').replace(/^"|"$/g, '')
const targets = Object.entries(objects.PBXNativeTarget).filter(([, value]) => value?.isa === 'PBXNativeTarget')
const app = targets.find(([, value]) => unquote(value.name) === 'App')
const share = targets.find(([, value]) => unquote(value.name) === 'MizanShare')
assert.ok(app && share, 'App and MizanShare must be real native targets')
const [appId, appTarget] = app, [shareId, shareTarget] = share
assert.equal(unquote(shareTarget.productType), 'com.apple.product-type.app-extension')
assert.ok(appTarget.dependencies.some(({ value }) => objects.PBXTargetDependency[value]?.target === shareId), 'App must explicitly depend on extension')
const copiedProducts = appTarget.buildPhases.flatMap(({ value }) => objects.PBXCopyFilesBuildPhase?.[value]?.dstSubfolderSpec === 13 ? objects.PBXCopyFilesBuildPhase[value].files : [])
assert.ok(copiedProducts.some(({ value }) => objects.PBXBuildFile[value].fileRef === shareTarget.productReference), 'App must embed the built extension product')
const group = 'group.com.faraday.followfinance'
for (const [targetId, target, infoFile, entitlementsFile] of [
  [appId, appTarget, 'App/Info.plist', 'App/App.entitlements'],
  [shareId, shareTarget, 'ShareExtension/Info.plist', 'ShareExtension/ShareExtension.entitlements'],
]) {
  const info = plist.readFileSync(path(infoFile)), entitlements = plist.readFileSync(path(entitlementsFile))
  assert.equal(info.MizanAppGroup, group)
  assert.deepEqual(entitlements['com.apple.security.application-groups'], [group])
  const configurations = objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations
  for (const { value } of configurations) {
    const settings = objects.XCBuildConfiguration[value].buildSettings
    assert.equal(unquote(settings.CODE_SIGN_ENTITLEMENTS), entitlementsFile)
    if (targetId === shareId) assert.equal(settings.APPLICATION_EXTENSION_API_ONLY, 'YES')
  }
  const groups = target.fileSystemSynchronizedGroups.map(({ value }) => objects.PBXFileSystemSynchronizedRootGroup[value])
  assert.ok(groups.some((entry) => unquote(entry.path) === 'Shared'), 'Both targets must compile the same inbox source')
  assert.ok(groups.every((entry) => existsSync(path(unquote(entry.path)))), 'Synchronized source folders must exist')
}
const extensionInfo = plist.readFileSync(path('ShareExtension/Info.plist'))
assert.equal(extensionInfo.NSExtension.NSExtensionPointIdentifier, 'com.apple.share-services')
assert.ok(extensionInfo.NSExtension.NSExtensionAttributes.NSExtensionActivationRule.includes('com.adobe.pdf'))
assert.ok(!extensionInfo.NSExtension.NSExtensionAttributes.NSExtensionActivationRule.includes('TRUEPREDICATE'))
const appInfo = plist.readFileSync(path('App/Info.plist'))
assert.ok(appInfo.CFBundleDocumentTypes.some((entry) => entry.LSItemContentTypes.includes('com.adobe.pdf')))
const config = JSON.parse(readFileSync(path('App/capacitor.config.json'), 'utf8'))
if (existsSync(path('App/GoogleService-Info.plist'))) {
  const firebase = plist.readFileSync(path('App/GoogleService-Info.plist'))
  assert.ok(existsSync(path('Firebase/GoogleService-Info.plist')), 'Firebase must be copied into a synchronized resource folder')
  assert.ok(appTarget.fileSystemSynchronizedGroups.some(({ value }) => unquote(objects.PBXFileSystemSynchronizedRootGroup[value].path) === 'Firebase'))
  assert.ok(appInfo.CFBundleURLTypes.some((entry) => entry.CFBundleURLSchemes.includes(firebase.REVERSED_CLIENT_ID)))
} else {
  assert.ok(!config.packageClassList.includes('FirebaseAuthenticationPlugin'), 'Missing Firebase config must not crash offline startup')
}
assert.ok(readdirSync(path('Shared')).includes('SharedPdfInbox.swift'))
assert.ok(readdirSync(path('Shared')).includes('SharedPdfGeneration.swift'))
console.log('iOS target graph, embedded extension, App Groups, PDF activation, document opening and optional Firebase resources validated.')
