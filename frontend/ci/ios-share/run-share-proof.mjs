import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { generateProbe } from './generate-probe-project.mjs'

assert.equal(process.platform, 'darwin', 'The real Simulator proof requires the Mac CI runner')
assert.ok(process.env.RUNNER_TEMP, 'Use the disposable Actions runner temporary directory')
const proof = path.join(process.env.RUNNER_TEMP, 'MizanShareProofEvidence')
const temporary = path.join(process.env.RUNNER_TEMP, 'MizanShareProbe')
mkdirSync(proof, { recursive: true })
mkdirSync(temporary, { recursive: true })
const summary = { status: 'preparing', stages: [], data: 'invented synthetic PDF only' }
let device, uiStarted
const run = (command, args, options = {}) => {
  console.log(`\n[share-proof] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', timeout: options.timeout ?? 120000, maxBuffer: 4 * 1024 * 1024 })
  if (result.status !== 0 || result.error) {
    if (options.capture) { if (result.stdout) console.error(result.stdout); if (result.stderr) console.error(result.stderr) }
    throw new Error(`${command} failed (${result.status ?? result.error?.code ?? 'unknown'})`)
  }
  return result.stdout?.trim() ?? ''
}
const simctl = (args, options) => run('xcrun', ['simctl', ...args], options)
const pause = () => new Promise(resolve => setTimeout(resolve, 200))
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const item = path.join(directory, entry.name)
  return entry.isDirectory() ? [item, ...walk(item)] : [item]
})
const pdfRecords = group => {
  const inbox = path.join(group, 'shared-pdf-inbox')
  return existsSync(inbox) ? readdirSync(inbox).filter(name => name.endsWith('.json')).map(name => path.join(inbox, name)) : []
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

try {
  run('swift', ['--version'])
  simctl(['help', 'get_app_container'])
  const devices = JSON.parse(simctl(['list', 'devices', 'available', '--json'], { capture: true })).devices
  const runtime = Object.keys(devices).filter(key => key.includes('.iOS-')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).find(key => devices[key].some(item => item.isAvailable && item.name.startsWith('iPhone')))
  assert.ok(runtime, 'No available iOS runtime with an iPhone device is installed')
  const template = devices[runtime].find(item => item.isAvailable && item.name.startsWith('iPhone'))
  const types = JSON.parse(simctl(['list', 'devicetypes', '--json'], { capture: true })).devicetypes
  const type = template.deviceTypeIdentifier ?? types.find(item => item.name === template.name)?.identifier
  assert.ok(type, 'Cannot determine the installed iPhone device type')
  device = simctl(['create', `MizanShareProof-${process.env.GITHUB_RUN_ID}`, type, runtime], { capture: true })
  assert.match(device, /^[0-9A-F-]{36}$/i)
  summary.runtime = runtime
  summary.deviceType = type
  simctl(['boot', device])
  simctl(['bootstatus', device, '-b'])
  run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', device])

  const app = path.join(temporary, 'App.app')
  run('ditto', [path.resolve('ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app'), app])
  for (const bundle of walk(app).filter(item => item.endsWith('.framework') || item.endsWith('.dylib')).sort((a, b) => b.length - a.length)) {
    run('codesign', ['--force', '--sign', '-', bundle])
  }
  run('codesign', ['--force', '--sign', '-', '--entitlements', 'ios/App/ShareExtension/ShareExtension.entitlements', path.join(app, 'PlugIns', 'MizanShare.appex')])
  run('codesign', ['--force', '--sign', '-', '--entitlements', 'ios/App/App/App.entitlements', app])
  run('codesign', ['--verify', '--strict', '--deep', app])
  run('codesign', ['--display', '--entitlements', '-', '--xml', app])
  run('codesign', ['--display', '--entitlements', '-', '--xml', path.join(app, 'PlugIns', 'MizanShare.appex')])
  simctl(['install', device, app])
  summary.stages.push('actual ad-hoc App+extension installed; containing app remains cold')

  const project = generateProbe(path.join(temporary, 'Probe'))
  assert.equal(path.extname(project), '.xcodeproj', 'xcodebuild requires the project bundle directory')
  assert.ok(existsSync(path.join(project, 'project.pbxproj')), 'The generated project bundle must contain its serialized AST')
  const derived = path.join(temporary, 'ProbeDerivedData')
  const destination = `platform=iOS Simulator,id=${device}`
  const common = ['-project', project, '-scheme', 'PDFShareProbe', '-configuration', 'Debug', '-destination', destination, '-derivedDataPath', derived, '-parallel-testing-enabled', 'NO', '-maximum-concurrent-test-simulator-destinations', '1', 'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGNING_REQUIRED=NO']
  uiStarted = Date.now()
  run('xcodebuild', ['test', ...common, '-only-testing:PDFShareProbeUITests/ShareFlowTests/testRealPDFShareTarget', '-maximum-test-execution-time-allowance', '120', '-resultBundlePath', path.join(proof, 'ShareTarget.xcresult')], { timeout: 210000 })
  summary.stages.push('real OS Share Sheet target and real extension success asserted by XCTest')

  // The real extension's containerURL access may allocate the group lazily.
  // Never create a group or call the receiver from this host-side harness.
  let group
  try { group = simctl(['get_app_container', device, 'com.faraday.followfinance', 'group.com.faraday.followfinance'], { capture: true }) }
  catch (error) { try { simctl(['get_app_container', device, 'com.faraday.followfinance', 'groups']) } catch {}; throw error }
  assert.ok(existsSync(group), 'The actual Mizan App Group container is unavailable after extension success')
  summary.stages.push('strict actual App Group container lookup after real extension delivery passed')
  const hostData = simctl(['get_app_container', device, 'com.faraday.ci.PDFShareProbe', 'data'], { capture: true })
  const fixture = readFileSync(path.join(hostData, 'Documents', 'synthetic-share-proof.pdf'))
  let records = pdfRecords(group)
  for (let attempt = 0; !records.length && attempt < 25; attempt++) { await pause(); records = pdfRecords(group) }
  assert.equal(records.length, 1, 'The OS share must create exactly one actual inbox receipt')
  const receipt = JSON.parse(readFileSync(records[0], 'utf8'))
  assert.equal(receipt.files.length, 1)
  assert.match(receipt.files[0].local, /^[0-9a-f-]{36}\.pdf$/i)
  const copied = readFileSync(path.join(group, 'shared-pdf-inbox', receipt.files[0].local))
  assert.equal(receipt.files[0].size, copied.length)
  assert.equal(digest(copied), digest(fixture), 'Actual App Group PDF bytes must match the host-generated fixture')
  assert.equal(receipt.fingerprint, createHash('sha256').update(copied).update(Buffer.from([0])).digest('hex'))
  summary.receipt = { files: 1, bytes: copied.length, matchingSha256: true }
  summary.stages.push('actual App Group receipt and PDF hash verified without inbox injection')

  const remaining = 300000 - (Date.now() - uiStarted)
  assert.ok(remaining > 30000, 'The total five-minute UI proof budget was exhausted')
  run('xcodebuild', ['test-without-building', ...common, '-only-testing:PDFShareProbeUITests/ShareFlowTests/testForegroundAutomaticallyImportsDelivery', '-maximum-test-execution-time-allowance', '120', '-resultBundlePath', path.join(proof, 'ForegroundImport.xcresult')], { timeout: remaining })
  let pending = pdfRecords(group)
  for (let attempt = 0; pending.length && attempt < 50; attempt++) { await pause(); pending = pdfRecords(group) }
  assert.equal(pending.length, 0, 'Closing the real import result must acknowledge and delete the delivery')
  assert.equal(readdirSync(path.join(group, 'shared-pdf-inbox')).filter(name => name.endsWith('.pdf')).length, 0)
  summary.stages.push('real Mizan foreground automatic import and native acknowledgement verified')
  summary.status = 'passed'
  console.log('PASS: actual iOS PDF Share Sheet target, extension receipt, foreground import and acknowledgement.')
} catch (error) {
  summary.status = 'failed'
  summary.error = error instanceof Error ? error.message : 'Unexpected proof failure'
  console.error(error)
  process.exitCode = 1
} finally {
  for (const name of ['ShareTarget', 'ForegroundImport']) {
    const bundle = path.join(proof, `${name}.xcresult`)
    if (existsSync(bundle)) {
      try { run('xcrun', ['xcresulttool', 'export', 'attachments', '--path', bundle, '--output-path', path.join(proof, `${name}-attachments`)]) }
      catch { console.error('Attachment export unavailable; the complete xcresult remains available.') }
    }
  }
  if (device) {
    if (summary.status === 'failed') {
      try {
        const logs = simctl(['spawn', device, 'log', 'show', '--last', '2m', '--style', 'compact', '--predicate', 'process == "App" OR process == "MizanShare" OR process == "PDFShareProbe"'], { capture: true, timeout: 30000 })
        writeFileSync(path.join(proof, 'recent-app-log.txt'), logs.split('\n').slice(-200).join('\n') + '\n')
      } catch { console.error('Bounded app log capture unavailable; XCTest evidence remains available.') }
    }
    try { simctl(['io', device, 'screenshot', path.join(proof, 'final-simulator.png')]) } catch {}
    try { simctl(['shutdown', device]) } catch {}
    try { simctl(['delete', device]) } catch {}
  }
  writeFileSync(path.join(proof, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
}
