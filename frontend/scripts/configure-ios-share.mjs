import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import xcode from 'xcode'
import plist from 'simple-plist'

// Structured project AST only: Capacitor's generated base is retained and new
// source directories use Xcode 16 folder synchronization, with no per-file edits.
const projectPath = fileURLToPath(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url))
const project = xcode.project(projectPath)
project.parseSync()
const objects = project.hash.project.objects
const main = project.getFirstTarget()
const root = project.getFirstProject().firstProject
// node-xcode's dependency helper requires these sections even in a one-target base.
objects.PBXTargetDependency ??= {}
objects.PBXContainerItemProxy ??= {}
const ref = (value, comment) => ({ value, comment })
const unquote = (value) => String(value ?? '').replace(/^"|"$/g, '')
let extensionId = Object.entries(objects.PBXNativeTarget).find(([key, value]) => !key.endsWith('_comment') && unquote(value.name) === 'MizanShare')?.[0]
if (!extensionId) {
  extensionId = project.addTarget('MizanShare', 'app_extension', 'ShareExtension', 'com.faraday.followfinance.share').uuid
  for (const type of ['PBXSourcesBuildPhase', 'PBXFrameworksBuildPhase', 'PBXResourcesBuildPhase']) project.addBuildPhase([], type, type.replace('PBX', '').replace('BuildPhase', ''), extensionId)
}
const extension = objects.PBXNativeTarget[extensionId]
if (!main.firstTarget.dependencies.some(({ value }) => objects.PBXTargetDependency[value]?.target === extensionId)) project.addTargetDependency(main.uuid, [extensionId])
objects.PBXFileSystemSynchronizedRootGroup ??= {}
objects.PBXFileSystemSynchronizedBuildFileExceptionSet ??= {}
const rootGroup = objects.PBXGroup[root.mainGroup]
function synchronizedGroup(path, name, excluded = [], target) {
  const section = objects.PBXFileSystemSynchronizedRootGroup
  let id = Object.entries(section).find(([key, value]) => !key.endsWith('_comment') && unquote(value.path) === path)?.[0]
  if (!id) {
    id = project.generateUuid()
    section[id] = { isa: 'PBXFileSystemSynchronizedRootGroup', path: `"${path}"`, name: `"${name}"`, sourceTree: 'SOURCE_ROOT', explicitFileTypes: {}, explicitFolders: [] }
    section[id + '_comment'] = name
    rootGroup.children.push(ref(id, name))
  }
  if (excluded.length && !section[id].exceptions?.length) {
    const exception = project.generateUuid()
    objects.PBXFileSystemSynchronizedBuildFileExceptionSet[exception] = { isa: 'PBXFileSystemSynchronizedBuildFileExceptionSet', membershipExceptions: excluded.map((name) => `"${name}"`), target }
    objects.PBXFileSystemSynchronizedBuildFileExceptionSet[exception + '_comment'] = `Exceptions for ${name}`
    section[id].exceptions = [ref(exception, `Exceptions for ${name}`)]
  }
  return ref(id, name)
}
const native = synchronizedGroup('App/Native', 'Native')
const shared = synchronizedGroup('Shared', 'Shared')
const share = synchronizedGroup('ShareExtension', 'ShareExtension', ['Info.plist', 'ShareExtension.entitlements'], extensionId)
main.firstTarget.fileSystemSynchronizedGroups = [native, shared]
extension.fileSystemSynchronizedGroups = [share, shared]
const firebaseConfig = new URL('../ios/App/App/GoogleService-Info.plist', import.meta.url)
if (existsSync(firebaseConfig)) {
  const firebaseFolder = new URL('../ios/App/Firebase/', import.meta.url)
  mkdirSync(firebaseFolder, { recursive: true })
  copyFileSync(firebaseConfig, new URL('GoogleService-Info.plist', firebaseFolder))
  main.firstTarget.fileSystemSynchronizedGroups.push(synchronizedGroup('Firebase', 'Firebase'))
  const google = plist.readFileSync(fileURLToPath(firebaseConfig))
  if (!google.REVERSED_CLIENT_ID || google.BUNDLE_ID !== 'com.faraday.followfinance') throw new Error('Expected the registered Mizan iOS Firebase app config')
  const infoPath = fileURLToPath(new URL('../ios/App/App/Info.plist', import.meta.url))
  const info = plist.readFileSync(infoPath)
  info.CFBundleURLTypes = [{ CFBundleURLSchemes: [google.REVERSED_CLIENT_ID] }]
  plist.writeFileSync(infoPath, info)
}
project.hash.project.objectVersion = 77
root.preferredProjectObjectVersion = 77
root.compatibilityVersion = '"Xcode 16.0"'
root.attributes.TargetAttributes[extensionId] ??= { CreatedOnToolsVersion: '16.0', ProvisioningStyle: 'Automatic' }
for (const id of [main.uuid, extensionId]) {
  root.attributes.TargetAttributes[id] ??= {}
  root.attributes.TargetAttributes[id].SystemCapabilities = { 'com.apple.ApplicationGroups.iOS': { enabled: 1 } }
}
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
function settings(target) {
  return objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations.map(({ value }) => objects.XCBuildConfiguration[value].buildSettings)
}
for (const build of settings(main.firstTarget)) Object.assign(build, {
  CODE_SIGN_ENTITLEMENTS: 'App/App.entitlements', CURRENT_PROJECT_VERSION: 28, MARKETING_VERSION: version,
  OTHER_LDFLAGS: ['"$(inherited)"', '"-ObjC"'], SWIFT_VERSION: '5.0',
})
for (const build of settings(extension)) Object.assign(build, {
  APPLICATION_EXTENSION_API_ONLY: 'YES', CODE_SIGN_STYLE: 'Automatic', CODE_SIGN_ENTITLEMENTS: 'ShareExtension/ShareExtension.entitlements',
  CURRENT_PROJECT_VERSION: 28, MARKETING_VERSION: version, GENERATE_INFOPLIST_FILE: 'NO',
  INFOPLIST_FILE: 'ShareExtension/Info.plist', IPHONEOS_DEPLOYMENT_TARGET: '15.0',
  PRODUCT_BUNDLE_IDENTIFIER: 'com.faraday.followfinance.share', SWIFT_VERSION: '5.0', TARGETED_DEVICE_FAMILY: '"1,2"',
})
for (const [key, phase] of Object.entries(objects.PBXCopyFilesBuildPhase ?? {})) {
  if (key.endsWith('_comment')) continue
  if (phase.dstSubfolderSpec === 13) {
    phase.name = '"Embed App Extensions"'
    for (const file of phase.files) objects.PBXBuildFile[file.value].settings = { ATTRIBUTES: ['RemoveHeadersOnCopy'] }
  }
}
writeFileSync(projectPath, project.writeSync())
// Reparse the result so a malformed project never passes configuration silently.
const verified = xcode.project(projectPath); verified.parseSync()
if (Object.values(verified.hash.project.objects.PBXNativeTarget).filter((target) => target?.isa === 'PBXNativeTarget').length !== 2) throw new Error('Expected App and MizanShare targets')
const verifiedObjects = verified.hash.project.objects
if (!verified.getFirstTarget().firstTarget.dependencies.some(({ value }) => verifiedObjects.PBXTargetDependency[value]?.target === extensionId)) throw new Error('App must explicitly build MizanShare before embedding it')
console.log('Configured App + embedded MizanShare; synchronized Swift folders and App Group entitlements are linked.')
if (!existsSync(new URL('../ios/App/App/GoogleService-Info.plist', import.meta.url))) console.log('Native Firebase Google sign-in requires the registered iOS GoogleService-Info.plist before the next cap sync.')
