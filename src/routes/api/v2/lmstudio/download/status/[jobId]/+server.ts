import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";
import { requireLmStudioBase } from "$lib/server/lmstudio";

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAuth(locals);
	const jobId = params.jobId;
	if (!jobId) {
		throw error(400, "Missing job id");
	}
	const base = requireLmStudioBase();

	const res = await fetch(`${base}/models/download/${encodeURIComponent(jobId)}`, {
		signal: AbortSignal.timeout(10_000),
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) {
		return superjsonResponse({ ...json, error: `LM Studio responded with ${res.status}` });
	}
	return superjsonResponse(json);
};
