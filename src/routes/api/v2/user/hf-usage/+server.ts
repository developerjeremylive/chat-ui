import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { collections } from "$lib/server/database";
import { authCondition } from "$lib/server/auth";
import { requireAuth } from "$lib/server/api/utils/requireAuth";

// Defensive subset of the whoami-v2 response. HF may add/remove usage fields
// without notice, so every field is read with optional chaining and the whole
// usage block is optional.
interface WhoamiUsage {
	usageInTokens?: number;
	usageInDollars?: number;
	monthlyInference?: number;
	monthlyInferenceDollars?: number;
	monthlyInferenceDollarsLimit?: number;
}

interface WhoamiResponse {
	type?: string;
	name?: string;
	isPro?: boolean;
	periodEnd?: string;
	usage?: WhoamiUsage;
}

/** Monthly inference credits granted per account type (from HF pricing docs). */
const MONTHLY_CREDITS_FREE = 0.1;
const MONTHLY_CREDITS_PRO = 2.0;

export const GET: RequestHandler = async ({ locals }) => {
	requireAuth(locals);

	const settings = await collections.settings.findOne(authCondition(locals));
	const hfApiKey = settings?.hfApiKey;

	if (!hfApiKey) {
		return superjsonResponse({ configured: false });
	}

	let response: Response;
	try {
		response = await fetch("https://huggingface.co/api/whoami-v2", {
			headers: { Authorization: `Bearer ${hfApiKey}` },
			signal: AbortSignal.timeout(10_000),
		});
	} catch {
		return superjsonResponse({ configured: true, valid: false, error: "network" });
	}

	if (!response.ok) {
		return superjsonResponse({ configured: true, valid: false, error: "unauthorized" });
	}

	const data = (await response.json()) as WhoamiResponse;

	const usage = data.usage;
	const monthlyLimit =
		usage?.monthlyInferenceDollarsLimit ??
		(data.isPro ? MONTHLY_CREDITS_PRO : MONTHLY_CREDITS_FREE);

	return superjsonResponse({
		configured: true,
		valid: true,
		username: data.name,
		isPro: data.isPro,
		monthlyCreditLimit: monthlyLimit,
		monthlySpentDollars: usage?.monthlyInferenceDollars ?? null,
		// Monthly inference credits (the HF free/PRO grant); the UI falls back to
		// showing a static grant when the whoami response carries no usage block.
		usage: usage ?? null,
	});
};
