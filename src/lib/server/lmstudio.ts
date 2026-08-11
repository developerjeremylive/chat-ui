import { error } from "@sveltejs/kit";

/**
 * Resolves the LM Studio REST API base (`http://host:port/api/v1`) from the
 * configured `OPENAI_EXTRA_BASE_URLS`, or throws a 503 when no LM Studio
 * provider is present. All management routes share this guard.
 */
export async function requireLmStudioBase(): Promise<string> {
	const { getLmStudioRESTBase } = await import("$lib/server/models");
	const base = getLmStudioRESTBase();
	if (!base) {
		throw error(
			503,
			"LM Studio is not configured. Add its OpenAI-compatible URL to OPENAI_EXTRA_BASE_URLS."
		);
	}
	return base;
}
