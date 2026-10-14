<script lang="ts">
  /** Settings -> App & display -> Look & feel: theme, text size, bottom bar, help buttons, motion. */
  import type { ThemePreference } from '../../lib/preferences/theme';
  import { trainingState } from '../../lib/state.svelte';
  import Icon from "@iconify/svelte";
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Theme</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Auto follows your phone's light or dark mode. High contrast is pure black and white - easiest to read outdoors in bright sun.</p>
  </div>
  <div class="flex bg-surface-elevated/50 p-1 rounded-control">
    {#each [['system', 'Auto', 'ic:baseline-brightness-auto'], ['light', 'Light', 'ic:baseline-light-mode'], ['dark', 'Dark', 'ic:baseline-dark-mode'], ['contrast', 'Contrast', 'ic:baseline-contrast']] as [id, label, icon]}
      <button
        onclick={() => trainingState.setTheme(id as ThemePreference)}
        aria-pressed={trainingState.theme === id}
        class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-label rounded-control transition-all {trainingState.theme === id ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
      >
        <Icon {icon} class="text-base" />{label}
      </button>
    {/each}
  </div>
</div>

  <div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Text Size</h3>
  </div>
  <div class="flex bg-surface-elevated/50 p-1 rounded-control">
    <button onclick={() => trainingState.setTextScale('sm')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'sm' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Small</button>
    <button onclick={() => trainingState.setTextScale('md')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'md' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Default</button>
    <button onclick={() => trainingState.setTextScale('lg')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'lg' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Large</button>
  </div>
</div>

  <div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Navigation</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">A menu button opens a side drawer with every screen, and a round + floats at the bottom; on a tablet, a laptop or a phone on its side a slim rail stays on the left. Or the classic bottom bar. Only on this device.</p>
  </div>
  <div class="flex bg-surface-elevated/50 p-1 rounded-control">
    <button onclick={() => trainingState.setNavStyle('drawer')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.navStyle === 'drawer' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Side drawer</button>
    <button onclick={() => trainingState.setNavStyle('bar')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.navStyle === 'bar' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Bottom bar</button>
  </div>
  <div class="space-y-1">
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Show the names under the icons (in the bottom bar and in the rail).</p>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button onclick={() => trainingState.setNavLabels(false)} class="flex-1 py-2.5 text-label rounded-control transition-all {!trainingState.navLabels ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Icons only</button>
      <button onclick={() => trainingState.setNavLabels(true)} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.navLabels ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Icons + labels</button>
    </div>
  </div>
</div>

  <div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Help Buttons</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The (?) next to terms like load, ACWR and phases - tap one for what it means.</p>
  </div>
  <div class="flex bg-surface-elevated/50 p-1 rounded-control">
    <button onclick={() => trainingState.setHelpButtons(true)} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.helpButtons ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Show</button>
    <button onclick={() => trainingState.setHelpButtons(false)} class="flex-1 py-2.5 text-label rounded-control transition-all {!trainingState.helpButtons ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Hide</button>
  </div>
</div>

  <div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Motion</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">"System" follows your device's reduced-motion setting automatically.</p>
  </div>
  <div class="flex bg-surface-elevated/50 p-1 rounded-control">
    <button onclick={() => trainingState.setMotion('system')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'system' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">System</button>
    <button onclick={() => trainingState.setMotion('full')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'full' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Full</button>
    <button onclick={() => trainingState.setMotion('reduced')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'reduced' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Reduced</button>
  </div>
</div>

