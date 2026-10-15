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
  import SectionHeader from './home/SectionHeader.svelte';

  const show = shouldOfferAndroidApp(readBrowserInfo(Capacitor.isNativePlatform()));
  let steps = $state(false);
</script>

{#if show && !installPrompt.cardDismissed}
  <div class="card space-y-3 animate-in fade-in">
    <SectionHeader label="Get the Android app" subtitle="Adds Google Drive sync, home-screen widgets, reminders and timer sound with the screen off. Your data here stays in the browser: export a backup, then restore it in the app.">
      {#snippet action()}
        <button onclick={() => installPrompt.dismissCard()} class="btn-icon" aria-label="Not now"><Icon icon="ic:baseline-close" class="text-lg" /></button>
      {/snippet}
    </SectionHeader>

    <a href={APP_INFO.apkUrl} download class="btn btn-secondary w-full">
      <Icon icon="ic:baseline-download" class="text-base" /> Download the APK
    </a>
    {#if installPrompt.canInstallWebApp}
      <button onclick={() => installPrompt.installWebApp()} class="btn btn-ghost w-full">
        Or install the web app
      </button>
    {/if}

     <button onclick={() => (steps = !steps)} class="btn-quiet text-caption text-primary" aria-expanded={steps}>{steps ? 'Hide' : 'How to install it'}</button>
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
