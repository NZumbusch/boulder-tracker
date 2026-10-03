<script lang="ts">
  /**
   * Settings → About & Help: report a bug or send feedback. Opens a
   * prefilled email or GitHub issue with the build and device; the error log
   * is only added when ticked, since an entry can mention what was open.
   * Nothing is sent by the app itself (lib/feedback.ts).
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { APP_INFO } from '../../lib/appInfo';
  import { updater } from '../../lib/update/updater.svelte';
  import { feedbackMailto, issueUrl, platformLabel, type FeedbackContext } from '../../lib/feedback';
  import { readErrorLog } from '../../lib/errorReporting';
  import { readBrowserInfo } from '../../lib/pwa/platform';

  let includeLog = $state(false);

  const context = $derived<FeedbackContext>({
    version: updater.installedName ?? APP_INFO.version,
    build: updater.installedCode,
    commit: APP_INFO.commit,
    platform: platformLabel({ native: Capacitor.isNativePlatform(), standalone: readBrowserInfo(Capacitor.isNativePlatform()).standalone }),
    userAgent: navigator.userAgent,
    errors: includeLog ? readErrorLog() : undefined,
  });
  const logCount = readErrorLog().length;
</script>

<div class="space-y-3 pt-4 border-t border-border">
  <h4 class="text-section uppercase text-content-muted">Report a bug or send feedback</h4>
  <p class="text-caption text-content-muted leading-relaxed">Opens a message with your app version and device filled in. You write the rest and send it yourself.</p>
  <label class="flex items-start gap-3 cursor-pointer">
    <input type="checkbox" bind:checked={includeLog} class="w-4 h-4 mt-0.5 rounded accent-primary shrink-0" />
    <span class="text-caption text-content-muted leading-relaxed">Include the latest entries of the error log ({logCount} saved). Read them first under Errors &amp; warnings: they can mention what you were doing.</span>
  </label>
  <div class="flex flex-wrap gap-2">
    <a href={feedbackMailto(context)} class="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-label font-semibold rounded-control">
      <Icon icon="ic:baseline-share" class="text-base" /> Send by email
    </a>
    <a href={issueUrl(context)} target="_blank" rel="noopener" class="flex items-center gap-1.5 px-3.5 py-2 border border-border-strong text-label text-content rounded-control hover:bg-surface-elevated">
      <Icon icon="ic:baseline-open-in-new" class="text-base" /> Open a GitHub issue
    </a>
  </div>
</div>
