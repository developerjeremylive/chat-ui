import type { RequestHandler } from "@sveltejs/kit";
import path from "node:path";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";
import { listInstalledModels } from "$lib/server/lmstudioDownload";
import { requireLmStudioConfig } from "$lib/server/lmstudio";

type V1Model = {
	key?: string;
	id?: string;
	display_name?: string;
	size_bytes?: number;
	loaded_instances?: unknown[];
	state?: string;
};

const normalizeKey = (key: string): string => path.resolve(key).toLowerCase();

export const GET: RequestHandler = async ({ locals }) => {
	requireAuth(locals);
	const models = await listInstalledModels();
	const byKey = new Map(models.map((m) => [normalizeKey(m.key), m]));

	const cfg = await requireLmStudioConfig().catch(() => undefined);
	if (cfg) {
		const root = cfg.base.replace(/\/api\/v1$/, "");
		const headers = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : undefined;

		const fetchJson = async (
			url: string
		): Promise<{ status: number; json: Record<string, unknown> } | undefined> => {
			try {
				const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
				return {
					status: res.status,
					json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
				};
			} catch {
				return undefined;
			}
		};

		const attempts: { url: string; pick: (json: Record<string, unknown>) => V1Model[] }[] = [
			{ url: `${cfg.base}/models`, pick: (json) => (json.models as V1Model[] | undefined) ?? [] },
			{
				url: `${root}/api/v0/models`,
				pick: (json) =>
					((json.data as V1Model[] | undefined) ?? []).map((m) => ({
						key: m.id,
						state: m.state,
					})),
			},
			{
				url: `${root}/v1/models`,
				pick: (json) => ((json.data as V1Model[] | undefined) ?? []).map((m) => ({ key: m.id })),
			},
		];

		for (const { url, pick } of attempts) {
			const result = await fetchJson(url);
			if (!result || result.status !== 200) continue;
			for (const m of pick(result.json)) {
				if (!m.key) continue;
				const loaded = Array.isArray(m.loaded_instances)
					? m.loaded_instances.length > 0
					: m.state === "loaded";
				const existing = byKey.get(normalizeKey(m.key));
				if (existing) {
					if (loaded) existing.loaded = true;
				} else {
					models.push({ key: m.key, displayName: m.display_name, loaded });
				}
			}
			break;
		}
	}

	return superjsonResponse({ models });
};
