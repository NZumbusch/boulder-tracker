<script lang="ts">
  /**
   * "Add to Home Screen" steps for the welcome screen and Settings → About
   * & Help, worded for the browser in use - Safari, Chrome, Firefox and
   * Edge each keep the entry somewhere different on iOS. Safari is the
   * most reliable, so the others say so.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { iosBrowser, readBrowserInfo, type IOSBrowser } from '../../lib/pwa/platform';

  let { browser = iosBrowser(readBrowserInfo(Capacitor.isNativePlatform())) }: { browser?: IOSBrowser } = $props();
</script>

<ol class="space-y-3">
  {#if browser === 'safari'}
    <li class="flex items-start gap-3">
      <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">1</span>
      <p class="text-body text-content leading-relaxed">
        In Safari, tap <Icon icon="ic:baseline-ios-share" class="inline text-lg text-primary -mt-1" /> <strong>Share</strong>
        <span class="text-content-subtle">(on newer iOS it may be under <Icon icon="ic:baseline-more-horiz" class="inline text-lg -mt-0.5" />)</span>.
      </p>
    </li>
  {:else if browser === 'chrome'}
    <li class="flex items-start gap-3">
      <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">1</span>
      <p class="text-body text-content leading-relaxed">In Chrome, tap <Icon icon="ic:baseline-ios-share" class="inline text-lg text-primary -mt-1" /> <strong>Share</strong> in the address bar.</p>
    </li>
  {:else if browser === 'firefox' || browser === 'edge'}
    <li class="flex items-start gap-3">
      <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">1</span>
      <p class="text-body text-content leading-relaxed">
        Tap the menu <Icon icon="ic:baseline-more-horiz" class="inline text-lg -mt-0.5" />, then <Icon icon="ic:baseline-ios-share" class="inline text-lg text-primary -mt-1" /> <strong>Share</strong>.
      </p>
    </li>
  {:else}
    <li class="flex items-start gap-3">
      <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">1</span>
      <p class="text-body text-content leading-relaxed">This browser can't reliably add web apps. Open this page in <strong>Safari</strong> and tap <Icon icon="ic:baseline-ios-share" class="inline text-lg text-primary -mt-1" /> <strong>Share</strong>.</p>
    </li>
  {/if}
  <li class="flex items-start gap-3">
    <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">2</span>
    <p class="text-body text-content leading-relaxed">Scroll down and tap <Icon icon="ic:outline-add-box" class="inline text-lg text-primary -mt-1" /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</p>
  </li>
  <li class="flex items-start gap-3">
    <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">3</span>
    <p class="text-body text-content leading-relaxed">Open <strong>Boulder Tracker</strong> from your Home Screen.</p>
  </li>
</ol>
{#if browser !== 'safari'}
  <p class="text-caption text-content-subtle leading-relaxed mt-3">Not there? Safari always has it: open this page in Safari instead.</p>
{/if}
