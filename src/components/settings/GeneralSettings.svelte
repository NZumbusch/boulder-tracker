<script lang="ts">
  /** Settings -> App & display -> Look & feel: theme, text size, bottom bar, help buttons, motion. */
  import type { ThemePreference } from '../../lib/preferences/theme';
  import { trainingState } from '../../lib/state.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import TunablesSettings from './TunablesSettings.svelte';
</script>

<div class="card space-y-3 animate-in fade-in">
  <div class="space-y-1">
    <h2 class="text-section uppercase text-content-muted px-1">Theme</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Automatic follows your phone's light or dark mode. High contrast is pure black and white, easiest to read outdoors in bright sun.</p>
  </div>
  <Segmented
    variant="setting"
    full
    label="Theme"
    value={trainingState.theme}
    onChange={(v) => trainingState.setTheme(v as ThemePreference)}
    options={[{ value: 'system', label: 'Automatic' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'contrast', label: 'High contrast' }]}
  />
</div>

<div class="card space-y-3 animate-in fade-in">
  <h2 class="text-section uppercase text-content-muted px-1">Text size</h2>
  <Segmented
    variant="setting"
    full
    label="Text size"
    value={trainingState.textScale}
    onChange={(v) => trainingState.setTextScale(v)}
    options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Default' }, { value: 'lg', label: 'Large' }]}
  />
  <p class="text-body text-content px-1" aria-hidden="true">Sample: max hangs, 3 sets of 7 seconds, rest 3 minutes.</p>
</div>

<div class="card space-y-3 animate-in fade-in">
  <div class="space-y-1">
    <div class="flex items-center justify-between gap-3 px-1">
      <h2 class="text-section uppercase text-content-muted">Navigation</h2>
      <span class="text-caption text-content-subtle">This device only</span>
    </div>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Automatic uses the bottom bar on a phone held upright, and a slim side rail with a menu button on a tablet, a laptop or a phone on its side. Or pick one for every screen.</p>
  </div>
  <Segmented
    variant="setting"
    full
    label="Navigation"
    value={trainingState.navMode}
    onChange={(v) => trainingState.setNavMode(v)}
    options={[{ value: 'auto', label: 'Automatic' }, { value: 'bar', label: 'Bottom bar' }, { value: 'drawer', label: 'Side drawer' }]}
  />
  <div class="space-y-1.5 pt-1">
    <h3 class="text-label text-content px-1">Names under the icons</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">In the bottom bar and in the side rail.</p>
    <Segmented
      variant="setting"
      full
      label="Names under the icons"
      value={trainingState.navLabels ? 'labels' : 'icons'}
      onChange={(v) => trainingState.setNavLabels(v === 'labels')}
      options={[{ value: 'icons', label: 'Icons only' }, { value: 'labels', label: 'Icons and names' }]}
    />
  </div>
</div>

<div class="card space-y-3 animate-in fade-in">
  <div class="space-y-1">
    <h2 class="text-section uppercase text-content-muted px-1">Help buttons</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The (?) next to terms like load, ACWR and phases. Tap one for what it means.</p>
  </div>
  <Segmented
    variant="setting"
    full
    label="Help buttons"
    value={trainingState.helpButtons ? 'show' : 'hide'}
    onChange={(v) => trainingState.setHelpButtons(v === 'show')}
    options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]}
  />
</div>

<div class="card space-y-3 animate-in fade-in">
  <div class="space-y-1">
    <h2 class="text-section uppercase text-content-muted px-1">Motion</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Automatic follows your device's reduced-motion setting.</p>
  </div>
  <Segmented
    variant="setting"
    full
    label="Motion"
    value={trainingState.motion}
    onChange={(v) => trainingState.setMotion(v)}
    options={[{ value: 'system', label: 'Automatic' }, { value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]}
  />
</div>

<TunablesSettings topic="layout" title="Panels" ids={['ui.raisedCards', 'ui.flatCards']} />
