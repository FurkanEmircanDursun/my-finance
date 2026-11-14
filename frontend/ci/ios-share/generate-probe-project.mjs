import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import xcode from 'xcode'
import plist from 'simple-plist'

export function generateProbe(outputRoot) {
  const sourceRoot = path.dirname(fileURLToPath(import.meta.url))
  const projectFolder = path.join(outputRoot, 'Probe.xcodeproj')
  mkdirSync(projectFolder, { recursive: true })
  const projectPath = path.join(projectFolder, 'project.pbxproj')
  const project = xcode.project(projectPath)
  project.hash = { project: { objects: {} } }
  const projectId = project.generateUuid(), mainId = project.generateUuid(), productsId = project.generateUuid()
  const ref = (value, comment) => ({ value, comment })
  const objects = Object.fromEntries([
    'PBXBuildFile', 'PBXFileReference', 'PBXGroup', 'PBXNativeTarget', 'PBXProject',
    'PBXTargetDependency', 'PBXContainerItemProxy', 'PBXSourcesBuildPhase', 'PBXResourcesBuildPhase',
    'PBXFrameworksBuildPhase', 'XCBuildConfiguration', 'XCConfigurationList',
    'PBXFileSystemSynchronizedRootGroup', 'PBXFileSystemSynchronizedBuildFileExceptionSet',
  ].map(name => [name, {}]))
  project.hash = { project: { archiveVersion: 1, classes: {}, objectVersion: 77, objects, rootObject: projectId, rootObject_comment: 'Project object' } }
  objects.PBXGroup[mainId] = { isa: 'PBXGroup', children: [ref(productsId, 'Products')], sourceTree: '"<group>"' }
  objects.PBXGroup[productsId] = { isa: 'PBXGroup', children: [], name: 'Products', sourceTree: '"<group>"' }
  objects.PBXGroup[productsId + '_comment'] = 'Products'
  const root = objects.PBXProject[projectId] = {
    isa: 'PBXProject', attributes: { LastUpgradeCheck: 2600, TargetAttributes: {} },
    compatibilityVersion: '"Xcode 16.0"', developmentRegion: 'en', knownRegions: ['en', 'Base'],
    mainGroup: mainId, productRefGroup: productsId, projectDirPath: '""', projectRoot: '""', targets: [], preferredProjectObjectVersion: 77,
  }
  objects.PBXProject[projectId + '_comment'] = 'Project object'
  root.buildConfigurationList = project.addXCConfigurationList(['Debug', 'Release'].map(name => ({
    isa: 'XCBuildConfiguration', name,
    buildSettings: { SDKROOT: 'iphoneos', IPHONEOS_DEPLOYMENT_TARGET: '15.0', CLANG_ENABLE_MODULES: 'YES', SWIFT_VERSION: '5.0' },
  })), 'Release', 'Project configurations').uuid

  const app = project.addTarget('PDFShareProbe', 'application', 'Probe', 'com.faraday.ci.PDFShareProbe')
  // addTarget assumes a containing app already exists; remove its automatic self edge.
  app.pbxNativeTarget.dependencies = []
  const test = project.addTarget('PDFShareProbeUITests', 'unit_test_bundle', 'Tests', 'com.faraday.ci.PDFShareProbeUITests')
  app.pbxNativeTarget.dependencies = []
  test.pbxNativeTarget.productType = '"com.apple.product-type.bundle.ui-testing"'
  const testProduct = objects.PBXFileReference[test.pbxNativeTarget.productReference]
  testProduct.name = '"PDFShareProbeUITests.xctest"'
  testProduct.path = '"PDFShareProbeUITests.xctest"'
  project.addTargetDependency(test.uuid, [app.uuid])
  root.attributes.TargetAttributes[test.uuid] = { CreatedOnToolsVersion: '26.0', TestTargetID: app.uuid }
  for (const target of [app, test]) {
    for (const type of ['PBXSourcesBuildPhase', 'PBXFrameworksBuildPhase', 'PBXResourcesBuildPhase']) project.addBuildPhase([], type, type, target.uuid)
    const configurations = objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList].buildConfigurations
    for (const { value } of configurations) {
      const settings = objects.XCBuildConfiguration[value].buildSettings
      Object.assign(settings, {
        SWIFT_VERSION: '5.0', IPHONEOS_DEPLOYMENT_TARGET: '15.0', TARGETED_DEVICE_FAMILY: '"1,2"',
        CODE_SIGN_STYLE: 'Manual', CODE_SIGN_IDENTITY: '"-"', CODE_SIGNING_ALLOWED: 'YES', DEVELOPMENT_TEAM: '""',
        CURRENT_PROJECT_VERSION: 1, MARKETING_VERSION: '1.0', GENERATE_INFOPLIST_FILE: 'YES',
      })
      delete settings.INFOPLIST_FILE
      if (target === app) { settings.INFOPLIST_FILE = 'Probe/Info.plist'; settings.GENERATE_INFOPLIST_FILE = 'NO'; settings.SKIP_INSTALL = 'NO' }
      else { settings.TEST_TARGET_NAME = 'PDFShareProbe'; settings.SWIFT_EMIT_LOC_STRINGS = 'NO'; settings.WRAPPER_EXTENSION = 'xctest' }
    }
    const directory = target === app ? 'Probe' : 'Tests'
    mkdirSync(path.join(outputRoot, directory), { recursive: true })
    copyFileSync(path.join(sourceRoot, target === app ? 'Probe.swift' : 'ShareFlowTests.swift'), path.join(outputRoot, directory, target === app ? 'Probe.swift' : 'ShareFlowTests.swift'))
    const groupId = project.generateUuid()
    objects.PBXFileSystemSynchronizedRootGroup[groupId] = { isa: 'PBXFileSystemSynchronizedRootGroup', path: directory, sourceTree: 'SOURCE_ROOT', explicitFileTypes: {}, explicitFolders: [] }
    if (target === app) {
      const exceptionId = project.generateUuid()
      objects.PBXFileSystemSynchronizedBuildFileExceptionSet[exceptionId] = { isa: 'PBXFileSystemSynchronizedBuildFileExceptionSet', membershipExceptions: ['Info.plist'], target: app.uuid }
      objects.PBXFileSystemSynchronizedRootGroup[groupId].exceptions = [ref(exceptionId, 'Info.plist exclusion')]
    }
    objects.PBXGroup[mainId].children.push(ref(groupId, directory))
    target.pbxNativeTarget.fileSystemSynchronizedGroups = [ref(groupId, directory)]
  }
  plist.writeFileSync(path.join(outputRoot, 'Probe', 'Info.plist'), {
    CFBundleDisplayName: 'PDF Share Probe', CFBundleExecutable: '$(EXECUTABLE_NAME)', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0', CFBundleName: '$(PRODUCT_NAME)', CFBundlePackageType: 'APPL',
    CFBundleShortVersionString: '1.0', CFBundleVersion: '1', LSRequiresIPhoneOS: true,
    UILaunchScreen: {}, UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
  })
  writeFileSync(projectPath, project.writeSync())
  const schemeRoot = path.join(projectFolder, 'xcshareddata', 'xcschemes')
  mkdirSync(schemeRoot, { recursive: true })
  const buildable = (target, name, product) => `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${target.uuid}" BuildableName="${product}" BlueprintName="${name}" ReferencedContainer="container:Probe.xcodeproj"/>`
  const appRef = buildable(app, 'PDFShareProbe', 'PDFShareProbe.app')
  const testRef = buildable(test, 'PDFShareProbeUITests', 'PDFShareProbeUITests.xctest')
  writeFileSync(path.join(schemeRoot, 'PDFShareProbe.xcscheme'), `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2600" version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
    <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${appRef}</BuildActionEntry>
    <BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${testRef}</BuildActionEntry>
  </BuildActionEntries></BuildAction>
  <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES">
    <Testables><TestableReference skipped="NO">${testRef}</TestableReference></Testables><MacroExpansion>${appRef}</MacroExpansion>
  </TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO"><BuildableProductRunnable runnableDebuggingMode="0">${appRef}</BuildableProductRunnable></LaunchAction>
  <AnalyzeAction buildConfiguration="Debug"/>
</Scheme>
`)
  const verified = xcode.project(projectPath); verified.parseSync()
  const targets = Object.values(verified.hash.project.objects.PBXNativeTarget).filter(value => value?.isa === 'PBXNativeTarget')
  assert.equal(targets.length, 2)
  assert.ok(targets.some(target => target.productType.includes('bundle.ui-testing')))
  assert.ok(verified.hash.project.objects.PBXFileReference[test.pbxNativeTarget.productReference].path.includes('.xctest'))
  assert.equal(app.pbxNativeTarget.dependencies.length, 0)
  assert.equal(test.pbxNativeTarget.dependencies.length, 1)
  assert.ok(!readFileSync(projectPath, 'utf8').includes('com.apple.ApplicationGroups'))
  return projectPath
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv[2], 'Provide an isolated output directory')
  console.log(generateProbe(path.resolve(process.argv[2])))
}
