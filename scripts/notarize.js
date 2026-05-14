/**
 * macOS notarization hook — invoked by electron-builder's afterSign.
 *
 * Calls @electron/notarize directly rather than relying on
 * electron-builder's own notarize wrapper, which has been buggy across
 * 24.x and crashes with `Cannot destructure property 'appBundleId' of
 * 'options'` when APPLE_* env vars are present. The plist + workflow
 * are set up so this hook is the only path that submits to Apple.
 *
 * Then staples the notarization ticket into the .app so Gatekeeper can
 * verify offline (and survive Apple-server outages on first launch).
 *
 * CRITICAL: must use `exports.default = ...`, NOT `module.exports = ...`.
 * electron-builder loads hooks via `require(path).default`; with the
 * wrong export shape the hook silently no-ops (no log, no error).
 *
 * The env vars are read under NOTARIZE_* names (set in the workflow)
 * rather than APPLE_* so electron-builder's auto-notarize wrapper
 * can't see them and fire alongside this hook.
 */

const { notarize } = require('@electron/notarize')
const { execFileSync } = require('child_process')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  console.log(`[notarize] afterSign hook entered (platform=${electronPlatformName})`)
  if (electronPlatformName !== 'darwin') return

  const appleId = process.env.NOTARIZE_APPLE_ID
  const appleIdPassword = process.env.NOTARIZE_APPLE_PASSWORD
  const teamId = process.env.NOTARIZE_APPLE_TEAM_ID
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('[notarize] Skipping — credentials not all set')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`
  const appBundleId = context.packager.appInfo.id

  console.log(`[notarize] Notarizing ${appPath} (bundleId=${appBundleId}, teamId=${teamId})`)
  await notarize({
    tool: 'notarytool',
    appBundleId,
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  })

  // Staple the notarization ticket into the .app so Gatekeeper can
  // verify offline (and during Apple-server outages on first launch).
  // @electron/notarize only submits + polls — it does NOT staple.
  // Failures here don't fail the build: the app is still validly
  // notarised, the ticket just isn't embedded.
  console.log('[notarize] Stapling ticket')
  try {
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' })
    console.log('[notarize] Stapled')
  } catch (err) {
    console.warn(`[notarize] Staple failed (build will continue): ${err.message}`)
  }
}
