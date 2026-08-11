import type { RequestHandler } from "@sveltejs/kit";
import { z } from "zod";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";
import { startDownload } from "$lib/server/lmstudioDownload";

const downloadSchema = z.object({
	model: z.string().min(1),
	quantization: z.string().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	requireAuth(locals);
	const body = downloadSchema.parse(await request.json());

	const result = await startDownload(body.model, body.quantization ?? "q4_k_m");
	if (result.status === "error") {
		if (result.error === "not_found") {
			return superjsonResponse({ status: "not_found" });
		}
		if (result.error === "already_downloaded") {
			return superjsonResponse({ status: "already_downloaded" });
		}
		return superjsonResponse({ status: "error", error: result.error });
	}
	return superjsonResponse(result);
};
