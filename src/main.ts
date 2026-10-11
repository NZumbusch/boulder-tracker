import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { registerOfflineIcons } from './lib/icons'
import { installPwa } from './lib/pwa/pwa'
import { installErrorReporting } from './lib/errorReporting'
import { installFormHelpers } from './lib/ui/formHelpers'

// Before anything renders: without this every icon is fetched from
// api.iconify.design on first use, so the whole UI loses its icons on a
// device with no connection. See `src/lib/icons/index.ts`.
registerOfflineIcons()

// Service worker, persistent storage, iOS tweaks - web only.
installPwa()

// Uncaught errors and failed saves show a message instead of vanishing.
installErrorReporting()

// Number fields select on focus; Enter moves to the next field.
installFormHelpers()

const target = document.getElementById('app');
if (!target) throw new Error('App target not found');

const app = mount(App, {
  target,
})

export default app
