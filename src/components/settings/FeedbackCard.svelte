<script lang="ts">
  /**
   * Settings → About & Help: report a bug or send feedback. Opens a
   * prefilled email or GitHub issue with the build and device; the error log
   * is only added when ticked, since an entry can mention what was open.
   * Nothing is sent by the app itself (lib/feedback.ts).
   */
  import Icon from '@iconify/svelte';
  import Toggle from '../ui/Toggle.svelte';
  import { toast } from '../../lib/toast.svelte';
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

  /** No mail app on the device (common on the web): the same text can be copied and pasted anywhere. */
  async function copyDetails() {
    const text = [
      `App version: ${context.version}${context.build ? ` (build ${context.build})` : ''}`,
      `Platform: ${context.platform}`,
      `Device: ${context.userAgent}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.show('Details copied');
    } catch {
      toast.show("Couldn't copy on this device");
    }
  }
</script>

<section class="card space-y-3 animate-in fade-in" aria-labelledby="about-feedback">
  <h2 id="about-feedback" class="text-section uppercase text-content-muted px-1">Report a bug or send feedback</h2>
  <p class="text-caption text-content-muted leading-relaxed">Opens a message with your app version and device filled in. You write the rest and send it yourself.</p>
  <Toggle checked={includeLog} onChange={(v) => (includeLog = v)} label="Include the error log" hint={`The latest entries (${logCount} saved). Read them first under Errors & warnings: they can mention what you were doing.`} />
  <div class="flex flex-wrap gap-2">
    <a href={feedbackMailto(context)} class="btn btn-primary gap-1.5">
      <Icon icon="ic:baseline-share" class="text-base" aria-hidden="true" /> Send by email
    </a>
    <a href={issueUrl(context)} target="_blank" rel="noopener" class="btn btn-secondary gap-1.5">
      <Icon icon="ic:baseline-open-in-new" class="text-base" aria-hidden="true" /> Open a GitHub issue<span class="sr-only"> (opens in a new tab)</span>
    </a>
    <button type="button" onclick={copyDetails} class="btn btn-secondary gap-1.5"><Icon icon="ic:baseline-content-copy" class="text-base" aria-hidden="true" /> Copy details</button>
  </div>
</section>
