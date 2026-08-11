import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";

// Search the Hugging Face Hub for GGUF models published by lmstudio-community,
// sorted by downloads, so the download UI offers popular, verified-quantized files.
const HF_API = "https://huggingface.co/api/models";

type CatalogEntry = {
	id: string;
	downloads?: number;
	likes?: number;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	requireAuth(locals);
	const query = (url.searchParams.get("q") ?? "").trim();

	const params = new URLSearchParams({
		author: "lmstudio-community",
		filter: "gguf",
		sort: "downloads",
		direction: "-1",
		limit: "20",
		full: "false",
	});
	if (query) params.set("search", query);

	try {
		const res = await fetch(`${HF_API}?${params}`, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) {
			return superjsonResponse({ models: [], error: `Hugging Face responded with ${res.status}` });
		}
		const data = (await res.json()) as CatalogEntry[];
		return superjsonResponse({
			models: data.map((m) => ({ id: m.id, downloads: m.downloads ?? 0, likes: m.likes ?? 0 })),
		});
	} catch {
		return superjsonResponse({ models: [], error: "Failed to reach Hugging Face" });
	}
};
