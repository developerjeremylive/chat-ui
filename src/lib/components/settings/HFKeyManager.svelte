<script lang="ts">
	import Modal from "$lib/components/Modal.svelte";
	import { useSettingsStore } from "$lib/stores/settings";
	import { base } from "$app/paths";
	import { onMount } from "svelte";
	import superjson from "superjson";
	import LucideKeyRound from "~icons/lucide/key-round";
	import CarbonTrashCan from "~icons/carbon/trash-can";

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	const settings = useSettingsStore();

	let keyInput = $state("");
	let showKey = $state(false);
	let isSaving = $state(false);
	let isLoading = $state(false);
	let error = $state("");
	let connected = $state(false);

	type UsageInfo = {
		configured: boolean;
		valid?: boolean;
		username?: string;
		isPro?: boolean;
		monthlyCreditLimit?: number;
		monthlySpentDollars?: number | null;
		error?: string;
	};

	let usage = $state<UsageInfo | null>(null);

	async function loadUsage() {
		if (!$settings.hfApiKey) {
			usage = null;
			connected = false;
			return;
		}
		isLoading = true;
		error = "";
		try {
			const res = await fetch(`${base}/api/v2/user/hf-usage`);
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const data = superjson.parse<UsageInfo>(await res.text());
			usage = data;
			connected = data.configured && data.valid === true;
			if (data.configured && data.valid === false) {
				error =
					data.error === "unauthorized"
						? "This key is invalid or was revoked."
						: "Could not reach Hugging Face. Try again later.";
			}
		} catch {
			error = "Could not load your Hugging Face usage. Try again later.";
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		const key = keyInput.trim();
		if (!key) {
			error = "Enter a Hugging Face API key (starts with hf_).";
			return;
		}
		if (!key.startsWith("hf_")) {
			error = "Hugging Face API keys start with hf_.";
			return;
		}
		isSaving = true;
		error = "";
		try {
			await settings.instantSet({ hfApiKey: key });
			keyInput = "";
			await loadUsage();
		} catch {
			error = "Failed to save the key. Try again.";
		} finally {
			isSaving = false;
		}
	}

	async function handleRemove() {
		isSaving = true;
		error = "";
		try {
			// null signals the server to unset the key (JSON.stringify drops undefined)
			await settings.instantSet({ hfApiKey: null });
			usage = null;
			connected = false;
		} catch {
			error = "Failed to remove the key. Try again.";
		} finally {
			isSaving = false;
		}
	}

	onMount(() => {
		void loadUsage();
	});

	let spent = $derived(usage?.monthlySpentDollars ?? null);
	let limit = $derived(usage?.monthlyCreditLimit ?? null);
	let percent = $derived(
		spent !== null && limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0
	);
	let maskedKey = $derived(
		$settings.hfApiKey
			? `${$settings.hfApiKey.slice(0, 4)}••••••••${$settings.hfApiKey.slice(-4)}`
			: ""
	);
</script>

<Modal width="w-[600px]" {onclose} closeButton>
	<div class="p-6">
		<!-- Header -->
		<div class="mb-6">
			<h2 class="mb-1 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-200">
				<LucideKeyRound class="size-5" />
				Hugging Face API Key
			</h2>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Connect your own Hugging Face account to use its access token for models and track
				your monthly inference credits.
			</p>
		</div>

		<!-- Status / connection -->
		{#if connected}
			<div class="mb-6 flex items-center justify-between rounded-lg bg-green-50 p-4 dark:bg-green-900/10">
				<div class="flex items-center gap-3">
					<div class="flex size-10 items-center justify-center rounded-xl bg-green-500/10">
						<LucideKeyRound class="size-5 text-green-600 dark:text-green-400" />
					</div>
					<div>
						<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
							Connected as {usage?.username ?? "your account"}
							{#if usage?.isPro}
								<span class="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
									PRO
								</span>
							{/if}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">{maskedKey}</p>
					</div>
				</div>
				<button
					onclick={handleRemove}
					disabled={isSaving}
					class="btn flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
				>
					<CarbonTrashCan class="size-4" />
					Remove
				</button>
			</div>

			<!-- Monthly credits -->
			<div class="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-white/5">
				<div class="mb-2 flex items-center justify-between">
					<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">Monthly credits</p>
					{#if spent !== null && limit}
						<p class="text-xs text-gray-600 dark:text-gray-400">
							${spent.toFixed(2)} / ${limit.toFixed(2)} spent
						</p>
					{:else}
						<p class="text-xs text-gray-600 dark:text-gray-400">Credits reset at the start of each month</p>
					{/if}
				</div>
				{#if spent !== null && limit}
					<div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
						<div
							class="h-full rounded-full {percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-green-500'}"
							style="width: {percent}%"
						></div>
					</div>
					<p class="text-xs text-gray-600 dark:text-gray-400">
						{percent}% used — ${Math.max(0, limit - spent).toFixed(2)} remaining this month
					</p>
				{:else}
					<p class="text-xs text-gray-600 dark:text-gray-400">
						Spending details are not exposed by the Hugging Face API. Monthly credits for
						Inference Providers are ${(usage?.monthlyCreditLimit ?? 0).toFixed(2)}
						{#if usage?.isPro}
							(PRO)
						{:else}
							(Free)
						{/if}
						and reset at the start of each month.
					</p>
				{/if}
			</div>
		{:else if $settings.hfApiKey}
			<!-- Key stored but validation failed / loading -->
			<div class="mb-6 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/10">
				<p class="text-sm text-gray-800 dark:text-gray-200">
					{isLoading
						? "Checking your key…"
						: "A key is saved but it could not be validated. You can re-enter it below or remove it."}
				</p>
			</div>
		{/if}

		<!-- Key input -->
		<div>
			<label for="hf-key-input" class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
				{connected ? "Replace key" : "Hugging Face access token"}
			</label>
			<div class="flex gap-2">
				<input
					id="hf-key-input"
					bind:value={keyInput}
					type={showKey ? "text" : "password"}
					placeholder="hf_••••••••••••••••••••••••"
					spellcheck="false"
					autocomplete="off"
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-gray-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:ring-gray-700"
				/>
				<button
					onclick={() => (showKey = !showKey)}
					class="btn flex-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
					aria-label={showKey ? "Hide key" : "Show key"}
				>
					{showKey ? "Hide" : "Show"}
				</button>
			</div>
			{#if error}
				<p class="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
			{/if}
			<div class="mt-4 flex items-center justify-between gap-3">
				<p class="text-xs text-gray-500 dark:text-gray-400">
					Create a token at{" "}
					<a
						href="https://huggingface.co/settings/tokens"
						target="_blank"
						rel="noopener noreferrer"
						class="text-blue-600 hover:underline dark:text-blue-400"
					>
						huggingface.co/settings/tokens
					</a>
				</p>
				<button
					onclick={handleSave}
					disabled={isSaving || !keyInput.trim()}
					class="btn flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
				>
					{isSaving ? "Saving…" : connected ? "Update key" : "Save & Connect"}
				</button>
			</div>
		</div>
	</div>
</Modal>
