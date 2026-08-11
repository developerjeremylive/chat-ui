import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";
import { requireLmStudioBase } from "$lib/server/lmstudio";

type InstalledModel = {
	key: string;
	displayName?: string;
	sizeBytes?: number;
	loaded?: boolean;
};

export const GET: RequestHandler = async ({ locals }) => {
	requireAuth(locals);
	const base = requireLmStudioBase();

	try {
		const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) {
			return superjsonResponse({ models: [], error: `LM Studio responded with ${res.status}` });
		}
		const json = (await res.json()) as { models?: InstalledModel[] };
		return superjsonResponse({ models: json.models ?? [] });
	} catch {
		return superjsonResponse({ models: [], error: "Failed to reach LM Studio" });
	}
};
