import type { RequestHandler } from "@sveltejs/kit";
import { z } from "zod";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";
import { requireLmStudioBase } from "$lib/server/lmstudio";

const downloadSchema = z.object({
	model: z.string().min(1),
	quantization: z.string().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	requireAuth(locals);
	const body = downloadSchema.parse(await request.json());
	const base = requireLmStudioBase();

	const res = await fetch(`${base}/models/download`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15_000),
	});

	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) {
		return superjsonResponse({ ...json, error: `LM Studio responded with ${res.status}` });
	}
	return superjsonResponse(json);
};
