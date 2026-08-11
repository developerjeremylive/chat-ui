import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";
import { serializeModelSummary } from "$lib/server/api/utils/serializeModel";

export const POST: RequestHandler = async ({ locals }) => {
	requireAuth(locals);

	const { refreshExtraProviderModels, models } = await import("$lib/server/models");
	const { count } = await refreshExtraProviderModels();

	return superjsonResponse({
		count,
		models: models.filter((m) => m.unlisted === false).map(serializeModelSummary),
	});
};
