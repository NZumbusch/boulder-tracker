import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { registerOfflineIcons } from './lib/icons'
import { installPwa } from './lib/pwa/pwa'
import { installErrorReporting } from './lib/errorReporting'
import { installFormHelpers } from './lib/ui/formHelpers'
import { installDataLog } from './lib/storage/dataLogStore'
import { APP_INFO } from './lib/appInfo'
import { DATA_EXPORT_VERSION } from './lib/constants'

// Before anything renders: without this every icon is fetched from
// api.iconify.design on first use, so the whole UI loses its icons on a
// device with no connection. See `src/lib/icons/index.ts`.
registerOfflineIcons()

// Service worker, persistent storage, iOS tweaks - web only.
installPwa()

// Uncaught errors and failed saves show a message instead of vanishing.
installErrorReporting()

// The data log (Settings → About & Help → Data log): which build started, and when the app was away.
installDataLog({ version: APP_INFO.version, commit: APP_INFO.commit, dataVersion: DATA_EXPORT_VERSION })

// Number fields select on focus; Enter moves to the next field.
installFormHelpers()

const target = document.getElementById('app');
if (!target) throw new Error('App target not found');

const app = mount(App, {
  target,
})

export default app
