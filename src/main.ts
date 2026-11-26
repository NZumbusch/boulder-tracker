import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { registerOfflineIcons } from './lib/icons'
import { installPwa } from './lib/pwa/pwa'
import { installFormHelpers } from './lib/ui/formHelpers'
import { installLogging, describe } from './lib/log'
import { setSaveErrorListener } from './lib/storage/persistence'
import { toast } from './lib/toast.svelte'
import { Capacitor } from '@capacitor/core'
import { APP_INFO } from './lib/appInfo'
import { DATA_EXPORT_VERSION } from './lib/constants'

// Before anything renders: without this every icon is fetched from
// api.iconify.design on first use, so the whole UI loses its icons on a
// device with no connection. See `src/lib/icons/index.ts`.
registerOfflineIcons()

// Service worker, persistent storage, iOS tweaks - web only.
installPwa()

// The app's one log (Settings → About & Help → Log; docs/logging.md): which build started, when the app was away,
// every console line and uncaught error - errors pop up as set there.
installLogging({ version: APP_INFO.version, commit: APP_INFO.commit, dataVersion: DATA_EXPORT_VERSION, native: Capacitor.isNativePlatform() })

// A save that didn't reach the disk always says so (it is in the log too).
setSaveErrorListener((err) => {
  toast.show(`Couldn't save your last change (${describe(err).slice(0, 80)}). If your phone's storage is full, free some up; export a backup to be safe.`)
})

// Number fields select on focus; Enter moves to the next field.
installFormHelpers()

const target = document.getElementById('app');
if (!target) throw new Error('App target not found');

const app = mount(App, {
  target,
})

export default app
