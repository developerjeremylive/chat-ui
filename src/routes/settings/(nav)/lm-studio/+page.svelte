<script lang="ts">
	import { onMount } from "svelte";
	import { invalidateAll } from "$app/navigation";
	import { useAPIClient, handleResponse } from "$lib/APIClient";
	import CarbonSearch from "~icons/carbon/search";
	import CarbonDownload from "~icons/carbon/download";
	import CarbonReset from "~icons/carbon/reset";
	import CarbonCheckmark from "~icons/carbon/checkmark";
	import CarbonWarning from "~icons/carbon/warning";
	import CarbonCube from "~icons/carbon/cube";

	const client = useAPIClient();

	type InstalledModel = {
		key: string;
		displayName?: string;
		sizeBytes?: number;
		loaded?: boolean;
	};
	type CatalogEntry = { id: string; downloads?: number; likes?: number };
	type DownloadJob = {
		jobId?: string;
		status?: string;
		message?: string;
		error?: string;
		downloadedBytes?: number;
		totalSizeBytes?: number;
		bytesPerSecond?: number;
	};

	let installed = $state<InstalledModel[]>([]);
	let installedLoading = $state(false);
	let installedError = $state<string | null>(null);

	let query = $state("");
	let catalog = $state<CatalogEntry[]>([]);
	let catalogLoading = $state(false);
	let catalogError = $state<string | null>(null);
	let searched = $state(false);

	let quantization = $state("q4_k_m");

	let activeJob: { jobId: string; model: string } | null = $state(null);
	let jobStatus = $state<DownloadJob | null>(null);
	let downloadError = $state<string | null>(null);
	let downloadNotice = $state<string | null>(null);

	let refreshing = $state(false);
	let refreshMessage = $state<string | null>(null);

	let pollTimer: ReturnType<typeof setInterval> | undefined;

	function errorText(e: unknown): string {
		if (e instanceof Error) {
			try {
				const parsed = JSON.parse(e.message);
				if (typeof parsed?.message === "string") return parsed.message;
				if (typeof parsed?.error === "string") return parsed.error;
			} catch {
				// not JSON, use raw message
			}
			return e.message;
		}
		return String(e);
	}

	function formatBytes(bytes?: number): string {
		if (bytes === undefined || bytes === null || isNaN(bytes)) return "—";
		const units = ["B", "KB", "MB", "GB", "TB"];
		let value = bytes;
		let i = 0;
		while (value >= 1024 && i < units.length - 1) {
			value /= 1024;
			i++;
		}
		return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
	}

	async function loadInstalled() {
		installedLoading = true;
		installedError = null;
		try {
			const res = (await client.lmstudio.get().then(handleResponse)) as {
				models?: InstalledModel[];
				error?: string;
			};
			if (res?.error) {
				installedError = res.error;
				installed = [];
			} else {
				installed = res?.models ?? [];
			}
		} catch (e) {
			installedError = errorText(e);
			installed = [];
		} finally {
			installedLoading = false;
		}
	}

	async function searchCatalog() {
		catalogLoading = true;
		catalogError = null;
		searched = true;
		try {
			const res = (await client.lmstudio.catalog
				.get({ query: { q: query.trim() || undefined } })
				.then(handleResponse)) as { models?: CatalogEntry[]; error?: string };
			if (res?.error) {
				catalogError = res.error;
				catalog = [];
			} else {
				catalog = res?.models ?? [];
			}
		} catch (e) {
			catalogError = errorText(e);
			catalog = [];
		} finally {
			catalogLoading = false;
		}
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = undefined;
		}
	}

	async function pollDownload(jobId: string) {
		try {
			const res = (await client.lmstudio["download-status"]({ jobId }).get().then(handleResponse)) as DownloadJob;
			jobStatus = res;
			if (res?.status === "completed" || res?.status === "error") {
				stopPolling();
				activeJob = null;
				void loadInstalled();
			}
		} catch (e) {
			stopPolling();
			activeJob = null;
			downloadError = errorText(e);
		}
	}

	async function startDownload(model: string) {
		downloadError = null;
		downloadNotice = null;
		jobStatus = null;
		try {
			const res = (await client.lmstudio.download
				.post({ model, quantization })
				.then(handleResponse)) as DownloadJob;
			if (res?.error) {
				downloadError = res.error;
				return;
			}
			if (res?.status === "started" && res.jobId) {
				activeJob = { jobId: res.jobId, model };
				stopPolling();
				pollTimer = setInterval(() => void pollDownload(res.jobId!), 2000);
				void pollDownload(res.jobId!);
			} else if (res?.status === "already_downloaded") {
				downloadNotice = `"${model}" is already downloaded.`;
				void loadInstalled();
			} else if (res?.status === "not_found") {
				downloadError = `Model "${model}" was not found.`;
			} else {
				downloadNotice = res?.message ?? `Download started for "${model}".`;
				void loadInstalled();
			}
		} catch (e) {
			downloadError = errorText(e);
		}
	}

	async function refreshModels() {
		refreshing = true;
		refreshMessage = null;
		try {
			const res = (await client.lmstudio.refresh.post().then(handleResponse)) as { count?: number };
			refreshMessage = `Registered ${res?.count ?? 0} new model(s).`;
			await invalidateAll();
		} catch (e) {
			refreshMessage = errorText(e);
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		void loadInstalled();
		return stopPolling;
	});

	const progressPercent = $derived.by(() => {
		if (!jobStatus?.totalSizeBytes) return 0;
		return Math.min(100, Math.round(((jobStatus.downloadedBytes ?? 0) / jobStatus.totalSizeBytes) * 100));
	});
</script>

<div class="flex w-full flex-col gap-4">
	<h2 class="text-center text-lg font-semibold text-gray-800 md:text-left dark:text-gray-200">
		LM Studio Models
	</h2>
	<p class="text-[12px] text-gray-500 dark:text-gray-400">
		Manage models in your local LM Studio server. Download GGUF files from the Hugging Face Hub,
		then refresh the model list so they appear in the sidebar.
	</p>

	<!-- Installed models -->
	<div
		class="rounded-xl border border-gray-200 bg-white px-3 shadow-xs dark:border-gray-700 dark:bg-gray-800"
	>
		<div class="flex items-center justify-between py-3">
			<div class="flex items-center gap-1.5">
				<CarbonCube class="size-4 text-gray-500 dark:text-gray-400" />
				<span class="text-[13px] font-medium text-gray-800 dark:text-gray-200">Installed models</span>
			</div>
			<button
				type="button"
				onclick={() => void loadInstalled()}
				disabled={installedLoading}
				class="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
			>
				<CarbonReset class="size-3.5 {installedLoading ? 'animate-spin' : ''}" />
				Refresh
			</button>
		</div>
		{#if installedLoading}
			<div class="py-3 text-[12px] text-gray-500 dark:text-gray-400">Loading…</div>
		{:else if installedError}
			<div class="flex items-center gap-1.5 py-3 text-[12px] text-red-600 dark:text-red-400">
				<CarbonWarning class="size-4 flex-none" />
				{installedError}
			</div>
		{:else if installed.length === 0}
			<div class="py-3 text-[12px] text-gray-500 dark:text-gray-400">No models installed yet.</div>
		{:else}
			<ul class="divide-y divide-gray-200 pb-2 dark:divide-gray-700">
				{#each installed as model (model.key)}
					<li class="flex items-center justify-between gap-2 py-2">
						<div class="min-w-0">
							<div class="truncate text-[13px] font-medium text-gray-800 dark:text-gray-200">
								{model.displayName || model.key}
							</div>
							<div class="truncate text-[11px] text-gray-500 dark:text-gray-400">
								{model.key}
								{#if model.sizeBytes !== undefined} · {formatBytes(model.sizeBytes)}{/if}
							</div>
						</div>
						{#if model.loaded}
							<span
								class="flex flex-none items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400"
							>
								<CarbonCheckmark class="size-3" />
								Loaded
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Catalog search + download -->
	<div
		class="rounded-xl border border-gray-200 bg-white px-3 shadow-xs dark:border-gray-700 dark:bg-gray-800"
	>
		<div class="py-3">
			<span class="text-[13px] font-medium text-gray-800 dark:text-gray-200">Download from Hugging Face</span>
			<div class="mt-2 flex gap-2">
				<input
					bind:value={query}
					type="search"
					placeholder="Search GGUF models (e.g. llama)"
					aria-label="Search GGUF models"
					class="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] placeholder:text-gray-400 focus:ring-2 focus:ring-gray-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:ring-gray-700"
					onkeydown={(e) => {
						if (e.key === "Enter") void searchCatalog();
					}}
				/>
				<button
					type="button"
					onclick={() => void searchCatalog()}
					disabled={catalogLoading}
					class="flex flex-none items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
				>
					<CarbonSearch class="size-3.5 {catalogLoading ? 'animate-spin' : ''}" />
					Search
				</button>
			</div>
		</div>
		{#if catalogError}
			<div class="flex items-center gap-1.5 pb-3 text-[12px] text-red-600 dark:text-red-400">
				<CarbonWarning class="size-4 flex-none" />
				{catalogError}
			</div>
		{:else if searched && !catalogLoading}
			{#if catalog.length === 0}
				<div class="pb-3 text-[12px] text-gray-500 dark:text-gray-400">No matching models.</div>
			{:else}
				<ul class="divide-y divide-gray-200 pb-2 dark:divide-gray-700">
					{#each catalog as entry (entry.id)}
						<li class="flex items-center justify-between gap-2 py-2">
							<div class="min-w-0">
								<div class="truncate text-[13px] font-medium text-gray-800 dark:text-gray-200">
									{entry.id}
								</div>
								<div class="text-[11px] text-gray-500 dark:text-gray-400">
									{entry.downloads?.toLocaleString() ?? 0} downloads · {entry.likes ?? 0} likes
								</div>
							</div>
							<div class="flex flex-none items-center gap-1.5">
								<select
									bind:value={quantization}
									aria-label="Quantization"
									class="rounded-md border border-gray-300 bg-white px-1 py-1 text-[11px] text-gray-800 focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
								>
									<option value="q4_k_m">q4_k_m</option>
									<option value="q5_k_m">q5_k_m</option>
									<option value="q8_0">q8_0</option>
								</select>
								<button
									type="button"
									onclick={() => void startDownload(entry.id)}
									disabled={activeJob !== null}
									class="flex flex-none items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
								>
									<CarbonDownload class="size-3.5" />
									Download
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>

	<!-- Active download progress -->
	{#if activeJob}
		<div
			class="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-xs dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between gap-2">
				<span class="truncate text-[13px] font-medium text-gray-800 dark:text-gray-200">
					Downloading {activeJob.model}
				</span>
				<span class="flex-none text-[11px] text-gray-500 dark:text-gray-400">
					{#if jobStatus?.status === "downloading"}
						{progressPercent}% · {formatBytes(jobStatus.bytesPerSecond)}/s
					{:else}
						Starting…
					{/if}
				</span>
			</div>
			<div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
				<div
					class="h-full rounded-full bg-gray-900 transition-all dark:bg-gray-100"
					style:width="{progressPercent}%"
				></div>
			</div>
			{#if jobStatus?.status === "downloading" && jobStatus.totalSizeBytes !== undefined}
				<div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
					{formatBytes(jobStatus.downloadedBytes)} / {formatBytes(jobStatus.totalSizeBytes)}
				</div>
			{/if}
		</div>
	{/if}

	{#if downloadError}
		<div class="flex items-center gap-1.5 text-[12px] text-red-600 dark:text-red-400">
			<CarbonWarning class="size-4 flex-none" />
			{downloadError}
		</div>
	{/if}
	{#if downloadNotice}
		<div class="flex items-center gap-1.5 text-[12px] text-green-600 dark:text-green-400">
			<CarbonCheckmark class="size-4 flex-none" />
			{downloadNotice}
		</div>
	{/if}

	<!-- Refresh registry -->
	<div
		class="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-xs dark:border-gray-700 dark:bg-gray-800"
	>
		<div class="flex items-center justify-between gap-2">
			<div class="min-w-0">
				<div class="text-[13px] font-medium text-gray-800 dark:text-gray-200">
					Refresh model registry
				</div>
				<p class="text-[12px] text-gray-500 dark:text-gray-400">
					Re-scan the LM Studio provider and register new downloads in the model list.
				</p>
			</div>
			<button
				type="button"
				onclick={() => void refreshModels()}
				disabled={refreshing}
				class="flex flex-none items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
			>
				<CarbonReset class="size-3.5 {refreshing ? 'animate-spin' : ''}" />
				Sync models
			</button>
		</div>
		{#if refreshMessage}
			<div class="mt-2 text-[12px] text-gray-500 dark:text-gray-400">{refreshMessage}</div>
		{/if}
	</div>
</div>
