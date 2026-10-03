<script lang="ts">
  /**
   * Home card for the web build on an Android phone: the Android app adds
   * Drive sync, widgets, reminders and timer sound with the screen off, and
   * it isn't in the Play Store, so this says where to get it and how to
   * trust it. Also Chrome's own "install web app" button when it offers one.
   * Closable for good; never shown inside the app itself.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { APP_INFO } from '../../lib/appInfo';
  import { readBrowserInfo, shouldOfferAndroidApp } from '../../lib/pwa/platform';
  import { installPrompt } from '../../lib/pwa/installPrompt.svelte';

  const show = shouldOfferAndroidApp(readBrowserInfo(Capacitor.isNativePlatform()));
  let steps = $state(false);
</script>

{#if show && !installPrompt.cardDismissed}
  <div class="card space-y-3 animate-in fade-in">
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-body font-semibold text-content">Get the Android app</p>
        <p class="text-caption text-content-subtle leading-relaxed">Adds Google Drive sync, home-screen widgets, reminders and timer sound with the screen off. Your data here stays in the browser: export a backup, then restore it in the app.</p>
      </div>
      <button onclick={() => installPrompt.dismissCard()} class="p-1 -mr-1 text-content-subtle hover:text-content" aria-label="Not now">
        <Icon icon="ic:baseline-close" class="text-lg" />
      </button>
    </div>

    <a href={APP_INFO.apkUrl} download class="w-full py-2.5 rounded-control bg-primary hover:bg-primary-hover text-white text-label font-bold transition-colors flex items-center justify-center gap-1.5">
      <Icon icon="ic:baseline-download" class="text-base" /> Download the APK
    </a>
    {#if installPrompt.canInstallWebApp}
      <button onclick={() => installPrompt.installWebApp()} class="w-full py-2.5 rounded-control border border-border text-label text-content hover:bg-surface-elevated transition-colors">
        Or install the web app
      </button>
    {/if}

    <button onclick={() => (steps = !steps)} class="text-caption text-primary" aria-expanded={steps}>{steps ? 'Hide' : 'How to install it'}</button>
    {#if steps}
      <ol class="text-caption text-content-muted space-y-1.5 list-decimal list-inside leading-relaxed">
        <li>Open the downloaded file (the browser's download bar, or your Files app).</li>
        <li>If Android asks, allow your browser to <strong>install unknown apps</strong>, then go back and tap Install.</li>
        <li>Play Protect may say it hasn't seen the app: it isn't in the Play Store. Tap <strong>More details → Install anyway</strong>.</li>
      </ol>
      <p class="text-caption text-content-subtle leading-relaxed">It's built from the public source by GitHub. <a href={APP_INFO.verifyUrl} target="_blank" rel="noopener" class="text-primary">Check the build yourself</a> · <a href={APP_INFO.repoUrl} target="_blank" rel="noopener" class="text-primary">Source code</a></p>
    {/if}
  </div>
{/if}
