<script lang="ts">
  /**
   * Settings → About & Help, top to bottom: what this app is (name, build,
   * where the code is), help and feedback, updates, privacy and safety, who
   * made it and what it uses, and last the technical error log.
   *
   * Each block is a labelled section with its own heading under the page's h2,
   * external links are whole rows (a comfortable tap target) that say they open
   * in a new tab, and icons beside text are hidden from screen readers.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { APP_INFO } from '../../lib/appInfo';
  import { trainingState } from '../../lib/state.svelte';
  import { tour } from '../../lib/tour/tour.svelte';
  import { updater } from '../../lib/update/updater.svelte';
  import { commitUrl, shortCommit } from '../../lib/update/appUpdate';
  import { readBrowserInfo, shouldOfferIOSInstall } from '../../lib/pwa/platform';
  import AppUpdateSettings from '../update/AppUpdateSettings.svelte';
  import IOSInstallSteps from '../onboarding/IOSInstallSteps.svelte';
  import FeedbackCard from './FeedbackCard.svelte';
  import ErrorLogCard from './ErrorLogCard.svelte';

  const offerInstall = shouldOfferIOSInstall(readBrowserInfo(Capacitor.isNativePlatform()));
  const commit = shortCommit(APP_INFO.commit);
  const licenceUrl = `${APP_INFO.repoUrl}/blob/main/LICENSE`;

  const LINKS = [
    { label: 'Source code', hint: 'The whole app, on GitHub', href: APP_INFO.repoUrl },
    { label: 'Check this build', hint: 'Commit, checksum and signature of the APK', href: APP_INFO.verifyUrl },
    { label: 'MIT licence', hint: 'Free to use and change', href: licenceUrl },
  ];
</script>

{#snippet externalRow(label: string, hint: string, href: string, newTab: boolean = true)}
  <a {href} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener' : undefined} class="flex items-center justify-between gap-3 min-h-11 py-2 group">
    <span class="min-w-0">
      <span class="block text-body font-semibold text-content group-hover:text-primary transition-colors">{label}{#if newTab}<span class="sr-only"> (opens in a new tab)</span>{/if}</span>
      <span class="block text-caption text-content-subtle truncate">{hint}</span>
    </span>
    <Icon icon={newTab ? 'ic:baseline-open-in-new' : 'ic:baseline-chevron-right'} class="text-lg text-content-subtle shrink-0" aria-hidden="true" />
  </a>
{/snippet}

{#snippet plainRow(label: string, hint: string)}
  <div class="min-h-11 py-2">
    <p class="text-body font-semibold text-content">{label}</p>
    <p class="text-caption text-content-subtle">{hint}</p>
  </div>
{/snippet}

<div class="space-y-4">
  <!-- 1. What this app is -->
  <section class="card space-y-3 animate-in fade-in" aria-labelledby="about-app">
    <div class="text-center pt-3 pb-1">
      <Icon icon="ic:baseline-terrain" class="text-6xl text-primary mx-auto mb-2" aria-hidden="true" />
      <h3 id="about-app" class="text-title text-content">{APP_INFO.name}</h3>
      <p class="text-body text-content-subtle mt-1">Version {updater.installedName ?? APP_INFO.version}</p>
      {#if updater.installedCode || commit}
        <p class="text-caption text-content-subtle mt-0.5 tabular-nums">
          {#if updater.installedCode}Build {updater.installedCode}{/if}{#if commit}{updater.installedCode ? ' · ' : ''}commit
            <a href={commitUrl(APP_INFO.commit)} target="_blank" rel="noopener" class="inline-block py-2.5 -my-2.5 text-primary underline underline-offset-2">{commit}<span class="sr-only"> (opens in a new tab)</span></a>{/if}
        </p>
      {/if}
    </div>
    <div class="divide-y divide-border border-t border-border">
      {#each LINKS as link}{@render externalRow(link.label, link.hint, link.href)}{/each}
    </div>
  </section>

  <!-- 2. Help and feedback -->
  <section class="card space-y-3 animate-in fade-in" aria-labelledby="about-help">
    <h3 id="about-help" class="text-section uppercase text-content-muted px-1">Help</h3>
    <button
      onclick={() => tour.start()}
      disabled={trainingState.isSessionActive}
      class="w-full flex items-center justify-between gap-3 min-h-11 py-2 group text-left disabled:opacity-50"
    >
      <span class="flex items-center gap-3 min-w-0">
        <Icon icon="ic:baseline-tour" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" aria-hidden="true" />
        <span class="min-w-0">
          <span class="block text-body font-semibold text-content group-hover:text-primary transition-colors">Take the tour</span>
          <span class="block text-caption text-content-subtle">{trainingState.isSessionActive ? 'Finish your running session first' : 'Every screen, on example data. Nothing is saved.'}</span>
        </span>
      </span>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" aria-hidden="true" />
    </button>
    {#if offerInstall}
      <div class="pt-3 border-t border-border space-y-3">
        <h4 class="text-body font-semibold text-content">Add to your Home Screen</h4>
        <p class="text-caption text-content-subtle leading-relaxed">Opens full screen, works offline, and keeps Safari from clearing your data. The Home Screen app has its own data, so export a backup here first and import it there.</p>
        <IOSInstallSteps />
      </div>
    {/if}
  </section>

  <FeedbackCard />

  <!-- 3. Updates (the Android app only) -->
  <AppUpdateSettings />

  <!-- 4. Privacy and safety -->
  <section class="card space-y-4 animate-in fade-in" aria-labelledby="about-privacy">
    <h3 id="about-privacy" class="text-section uppercase text-content-muted px-1">Privacy and safety</h3>
    <p class="text-caption text-content-muted leading-relaxed">
      No account, no server, no ads, no tracking: your data stays on this device, and in your own Google Drive if you turn on sync.
    </p>
    <div class="border-t border-border">
      {@render externalRow('Privacy policy', 'What is stored, and what leaves the device', APP_INFO.privacyUrl)}
    </div>
    <div class="space-y-1.5 pt-3 border-t border-border">
      <h4 class="text-body font-semibold text-content">Not medical advice</h4>
      <p class="text-caption text-content-muted leading-relaxed">
        The readiness score, load numbers, pain tracking and AI coach prompts are training aids, not medical advice or a diagnosis. For pain that persists, gets worse or worries you, see a doctor or physiotherapist.
      </p>
    </div>
  </section>

  <!-- 5. Who made it -->
  <section class="card space-y-3 animate-in fade-in" aria-labelledby="about-credits">
    <div class="px-1">
      <h3 id="about-credits" class="text-section uppercase text-content-muted">Made by</h3>
      <p class="text-body text-content mt-1">{APP_INFO.developer}</p>
    </div>
    <address class="not-italic divide-y divide-border border-t border-border">
      {@render externalRow('Email', APP_INFO.email, `mailto:${APP_INFO.email}`, false)}
      {@render externalRow('Website', APP_INFO.homepage.replace('https://', ''), APP_INFO.homepage)}
    </address>
  </section>

  <!-- 6. What it uses -->
  <section class="card space-y-3 animate-in fade-in" aria-labelledby="about-uses">
    <h3 id="about-uses" class="text-section uppercase text-content-muted px-1">Built with</h3>
    <div class="divide-y divide-border border-t border-border">
      {@render plainRow('Svelte and Capacitor', 'The app and its Android shell')}
      {@render plainRow('Material Icons, via Iconify', 'All icons')}
      {@render externalRow('Open-Meteo.com', 'Weather data (CC BY 4.0)', 'https://open-meteo.com')}
    </div>
  </section>

  <!-- 7. Technical: the error log -->
  <ErrorLogCard />
</div>
