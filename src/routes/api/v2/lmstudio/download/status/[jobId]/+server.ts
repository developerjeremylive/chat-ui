import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";
import { getDownloadJob } from "$lib/server/lmstudioDownload";

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAuth(locals);
	const jobId = params.jobId;
	if (!jobId) {
		throw error(400, "Missing job id");
	}

	const job = getDownloadJob(jobId);
	if (!job) {
		return superjsonResponse({ status: "error", error: "Unknown download job" });
	}
	return superjsonResponse(job);
};
