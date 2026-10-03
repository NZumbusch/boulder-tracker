<script lang="ts">
  /**
   * Shown when the page is open inside another app's browser (Reddit,
   * Instagram…): it can't install the web app, and what's entered there is
   * kept apart from the real browser's. Points to the real one. Closable
   * for this visit only - it is back on the next, since the problem is too.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { toast } from '../../lib/toast.svelte';
  import { chromeIntentUrl, isAndroidWeb, isInAppBrowser, isIOS, readBrowserInfo } from '../../lib/pwa/platform';

  const info = readBrowserInfo(Capacitor.isNativePlatform());
  const show = isInAppBrowser(info);
  const browserName = isIOS(info) ? 'Safari' : 'Chrome';
  const chromeLink = isAndroidWeb(info) ? chromeIntentUrl(window.location.href) : null;
  let closed = $state(false);

  async function copyLink() {
    const href = window.location.href.split('#')[0];
    try {
      await navigator.clipboard.writeText(href);
      toast.show(`Link copied. Paste it into ${browserName}.`);
    } catch {
      toast.show(`Couldn't copy. Use the app's menu → "Open in browser".`);
    }
  }
</script>

{#if show && !closed}
  <div class="shrink-0 w-full bg-primary/10 border-b border-primary/30 px-4 py-2.5 flex items-start gap-3" role="status">
    <Icon icon="ic:baseline-open-in-new" class="text-xl text-primary shrink-0 mt-0.5" />
    <div class="min-w-0 flex-1 space-y-1.5">
      <p class="text-label text-content leading-snug">Open this in {browserName}</p>
      <p class="text-caption text-content-muted leading-relaxed">This browser inside another app can't install Boulder Tracker, and data you enter here stays here. Open the link in {browserName} first.</p>
      <div class="flex flex-wrap gap-2 pt-0.5">
        <button onclick={copyLink} class="px-3 py-1.5 rounded-control bg-primary text-white text-label font-semibold">Copy link</button>
        {#if chromeLink}<a href={chromeLink} class="px-3 py-1.5 rounded-control border border-border-strong text-label text-content">Open in Chrome</a>{/if}
      </div>
    </div>
    <button onclick={() => (closed = true)} class="p-1 -mr-1 text-content-subtle hover:text-content shrink-0" aria-label="Close">
      <Icon icon="ic:baseline-close" class="text-lg" />
    </button>
  </div>
{/if}
