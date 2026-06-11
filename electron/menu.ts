/**
 * Application menu — replaces Electron's default menu with a custom template
 * that mirrors the in-app Help sidebar.
 *
 * The interesting part is the Help menu: instead of the default "Search"
 * stub, we surface a Documentation submenu whose items are the same 13
 * topics rendered by src/pages/Help.tsx. Clicking a menu item sends an IPC
 * message 'help:navigate' with the topic id; the renderer routes to
 * /help?topic=<id> and Help.tsx reads the search param to select the topic.
 *
 * Topic ids MUST match those in src/pages/Help.tsx's TOPICS array. The
 * grouping mirrors the in-page sidebar (Start here / Setup / Workflows /
 * Sharing & export), separated by visual separators.
 *
 * All other menus are standard Electron roles so we don't reinvent
 * Undo/Redo/Reload/etc.
 */
import { app, Menu, BrowserWindow, shell, type MenuItemConstructorOptions } from 'electron'
import path from 'path'

// Topic id + label. Keep in sync with src/pages/Help.tsx TOPICS array — the
// id is what the renderer router uses to select the topic.
interface HelpTopic { id: string; label: string }

const HELP_TOPICS_START: HelpTopic[] = [
  { id: 'getting-started', label: 'Getting Started' },
]
const HELP_TOPICS_SETUP: HelpTopic[] = [
  { id: 'setup', label: 'Setup Tab' },
]
// Mirrors the workspace tab strip phases: Explore → Measure → Verify.
const HELP_TOPICS_WORKFLOWS: HelpTopic[] = [
  { id: 'coverage', label: 'Coverage' },
  { id: 'map',      label: 'Map' },
  { id: 'read',     label: 'Read' },
  { id: 'discover', label: 'Discover' },
  { id: 'score',    label: 'Score' },
  { id: 'track',    label: 'Track' },
  { id: 'compare',  label: 'Compare' },
  { id: 'audit',    label: 'Audit' },
  { id: 'gap',      label: 'Gap' },
]
const HELP_TOPICS_SHARING: HelpTopic[] = [
  { id: 'paper-bundle',   label: 'Paper-ready Bundle' },
  { id: 'project-bundle', label: 'Project Bundle (.lens)' },
]

/** Build a Documentation submenu item that fires `help:navigate` IPC on click. */
function helpTopicItem(window: BrowserWindow | null, topic: HelpTopic): MenuItemConstructorOptions {
  return {
    label: topic.label,
    click: () => {
      window?.webContents.send('help:navigate', topic.id)
    },
  }
}

/**
 * Resolve the user-manual PDF path for the current run mode.
 *  - packaged: copied to process.resourcesPath via electron-builder extraResources
 *  - dev:      repo root (sibling of electron/)
 *
 * Returns null if the file can't be located, so the menu can omit the item
 * cleanly rather than ship a broken link.
 */
function resolveUserManualPath(): string | null {
  const fs = require('fs') as typeof import('fs')
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'Document-Lens-User-Manual.pdf')]
    : [
        path.join(__dirname, '..', 'Document-Lens-User-Manual.pdf'),
        path.join(__dirname, '..', '..', 'Document-Lens-User-Manual.pdf'),
      ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

/**
 * Build the full application menu template. Standard roles for File / Edit /
 * View / Window, custom Help. On macOS, prepends the App menu (about, prefs,
 * quit) — required for native feel.
 */
export function buildMenu(
  window: BrowserWindow | null,
  onCheckForUpdates?: () => void
): Menu {
  const isMac = process.platform === 'darwin'
  const manualPath = resolveUserManualPath()

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => onCheckForUpdates?.(),
  }

  const documentationSubmenu: MenuItemConstructorOptions[] = [
    ...HELP_TOPICS_START.map((t) => helpTopicItem(window, t)),
    { type: 'separator' },
    ...HELP_TOPICS_SETUP.map((t) => helpTopicItem(window, t)),
    { type: 'separator' },
    ...HELP_TOPICS_WORKFLOWS.map((t) => helpTopicItem(window, t)),
    { type: 'separator' },
    ...HELP_TOPICS_SHARING.map((t) => helpTopicItem(window, t)),
  ]

  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Documentation',
      submenu: documentationSubmenu,
    },
  ]
  if (manualPath) {
    helpSubmenu.push({ type: 'separator' })
    helpSubmenu.push({
      label: 'Open User Manual (PDF)',
      click: () => {
        shell.openPath(manualPath).catch((err) => console.error('Failed to open manual:', err))
      },
    })
  }
  if (!isMac) {
    // macOS surfaces About + Check for Updates inside the App menu (added
    // below). On Windows/Linux, the conventional place is the Help menu.
    helpSubmenu.push({ type: 'separator' })
    helpSubmenu.push(checkForUpdatesItem)
    helpSubmenu.push({ role: 'about' })
  }

  const template: MenuItemConstructorOptions[] = [
    // App menu — macOS only. Quit/Hide/etc. by convention live here on Mac;
    // on Windows/Linux Quit goes in the File menu (below).
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        checkForUpdatesItem,
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ] as MenuItemConstructorOptions[],
    }] : []),

    // File menu — minimal; the app's project/file operations live in-UI.
    // We provide Close Window + Quit (non-mac) so the menu doesn't look empty.
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' },
      ] as MenuItemConstructorOptions[],
    },

    // Edit — standard text-editing roles. The DB-management bits (find, etc.)
    // are in-UI on the Library page; the menu just covers OS-standard editing.
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
              { type: 'separator' as const },
              {
                label: 'Speech',
                submenu: [
                  { role: 'startSpeaking' as const },
                  { role: 'stopSpeaking' as const },
                ],
              },
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const },
            ]),
      ] as MenuItemConstructorOptions[],
    },

    // View — standard Chromium dev/zoom helpers. Reload + DevTools are
    // valuable for an Electron app, especially during user-reported bugs.
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ] as MenuItemConstructorOptions[],
    },

    // Window — minimize / close, plus the Mac-specific arrangement helpers.
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ] as MenuItemConstructorOptions[],
    },

    // Help — the bespoke part.
    {
      role: 'help',
      submenu: helpSubmenu,
    },
  ]

  return Menu.buildFromTemplate(template)
}
