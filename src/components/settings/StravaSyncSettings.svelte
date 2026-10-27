<script lang="ts">
  /**
   * Strava sync (Android): connect with your own Strava API app, then new
   * activities arrive by themselves. How it works and what is stored where:
   * `lib/strava/stravaSync.svelte.ts`.
   */
  import { stravaSync, FIRST_SYNC_DAYS } from '../../lib/strava/stravaSync.svelte';
  import { STRAVA_CALLBACK_DOMAIN } from '../../lib/strava/stravaApi';
  import { showConfirm } from '../../lib/utils';

  let clientId = $state(stravaSync.credentials?.clientId ?? '');
  let clientSecret = $state(stravaSync.credentials?.clientSecret ?? '');
  let reveal = $state(false);
  let copied = $state(false);
  const ready = $derived(clientId.trim() !== '' && clientSecret.trim() !== '');

  const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function connect() {
    stravaSync.saveCredentials({ clientId, clientSecret });
    await stravaSync.startLogin();
  }
  async function copyDomain() {
    try {
      await navigator.clipboard.writeText(STRAVA_CALLBACK_DOMAIN);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch { /* the domain is shown in full to copy by hand */ }
  }
  async function everything() {
    if (await showConfirm('Read your whole Strava history?', 'Every activity on Strava is fetched (a few requests per hundred activities). Ones you already imported are not doubled.', { ok: 'Fetch all', cancel: 'Cancel' })) {
      await stravaSync.syncNow({ days: 0 });
    }
  }
  async function signOut() {
    if (await showConfirm('Disconnect Strava?', 'New activities stop arriving. What was already imported stays, and your Client ID and secret stay on this device for a quick reconnect.', { ok: 'Disconnect', cancel: 'Keep connected' })) {
      stravaSync.disconnect();
    }
  }
  async function forget() {
    if (await showConfirm('Forget the Client ID and secret?', 'They are removed from this device and you are disconnected. Imported activities stay.', { ok: 'Forget', cancel: 'Keep' })) {
      stravaSync.forgetCredentials();
      clientId = '';
      clientSecret = '';
    }
  }
</script>

{#if stravaSync.supported}
  <div class="card space-y-4 animate-in fade-in">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1 px-1 min-w-0">
        <h2 class="text-section uppercase text-content-muted">Strava sync</h2>
        <p class="text-caption text-content-subtle leading-relaxed">
          New Strava activities (so also your Garmin ones, when Garmin sends them to Strava) arrive by themselves when you open the app, with a route where there was GPS. No file export needed. They show in History → Activities like imported ones; daily values such as HRV still need a Garmin export. Strava only logs in with an app's secret, so you use your own free Strava API app: the Client ID and secret stay on this phone, they are not in backups, settings files or Drive sync, and nothing goes through a server.
        </p>
      </div>
      {#if stravaSync.connected}
        <span class="flex items-center gap-1.5 text-caption shrink-0 mt-0.5 {stravaSync.error ? 'text-status-caution' : 'text-content-subtle'}">
          <span class="w-1.5 h-1.5 rounded-full {stravaSync.error ? 'bg-status-caution' : stravaSync.syncing ? 'bg-primary animate-pulse' : 'bg-status-good'}"></span>
          {stravaSync.syncing ? 'Syncing…' : stravaSync.error ? 'Problem' : 'On'}
        </span>
      {/if}
    </div>

    {#if !stravaSync.connected}
      <ol class="text-caption text-content-subtle leading-relaxed list-decimal pl-6 space-y-1">
        <li>On strava.com open Settings → My API Application (strava.com/settings/api) and create an app: any name, category and website.</li>
        <li>
          As <strong class="text-content">Authorization Callback Domain</strong> enter <code class="text-content">{STRAVA_CALLBACK_DOMAIN}</code>
          <button onclick={copyDomain} class="btn-quiet px-2 text-label text-primary">{copied ? 'Copied' : 'Copy'}</button>
        </li>
        <li>Paste the app's Client ID and Client Secret below, then Connect. On Strava's screen leave "View data about your private activities" ticked.</li>
      </ol>
      <div class="space-y-1.5">
        <label for="strava-id" class="text-label text-content-subtle px-1 block">Client ID</label>
        <input id="strava-id" inputmode="numeric" autocomplete="off" spellcheck="false" bind:value={clientId} class="field w-full" />
        <label for="strava-secret" class="text-label text-content-subtle px-1 block">Client Secret</label>
        <input id="strava-secret" type={reveal ? 'text' : 'password'} autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={clientSecret} class="field w-full" />
        <label class="flex items-center gap-2 px-1 text-caption text-content-subtle"><input type="checkbox" bind:checked={reveal} /> Show the secret</label>
      </div>
      <button onclick={connect} disabled={!ready || stravaSync.syncing} class="btn btn-primary w-full">
        {stravaSync.syncing ? 'Connecting…' : 'Connect to Strava'}
      </button>
      {#if stravaSync.credentials}
        <button onclick={forget} class="btn btn-danger w-full">Forget Client ID and secret</button>
      {/if}
    {:else}
      <div class="space-y-1 px-1">
        <p class="text-body text-content">Connected{stravaSync.athlete ? ` as ${stravaSync.athlete}` : ''}</p>
        <p class="text-caption text-content-subtle">
          {#if stravaSync.lastSyncAt}Last sync {when(stravaSync.lastSyncAt)}{:else}Not synced yet{/if}{#if stravaSync.lastResult} · {stravaSync.lastResult.added} new{#if stravaSync.lastResult.skipped > 0}, {stravaSync.lastResult.skipped} left out (they match a session you logged or an activity from another source){/if}{/if}.
          Syncs again when you open the app. The first sync reads the last {FIRST_SYNC_DAYS} days.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button onclick={() => stravaSync.syncNow()} disabled={stravaSync.syncing} class="btn btn-primary">{stravaSync.syncing ? 'Syncing…' : 'Sync now'}</button>
        <button onclick={everything} disabled={stravaSync.syncing} class="btn btn-secondary">Fetch all history</button>
        <button onclick={signOut} class="btn btn-danger">Disconnect</button>
      </div>
    {/if}

    {#if stravaSync.error}
      <p class="text-caption text-status-caution px-1" role="alert">{stravaSync.error}</p>
    {/if}
  </div>
{/if}
