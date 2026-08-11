import { error } from "@sveltejs/kit";

type LmStudioConfig = {
	base: string;
	apiKey?: string;
};

/**
 * Resolves the LM Studio REST API config (`http://host:port/api/v1` + optional
 * api key) from the configured `OPENAI_EXTRA_BASE_URLS`, or throws a 503 when
 * no LM Studio provider is present. All management routes share this guard.
 */
export async function requireLmStudioConfig(): Promise<LmStudioConfig> {
	const { getLmStudioConfig } = await import("$lib/server/models");
	const cfg = getLmStudioConfig();
	if (!cfg) {
		throw error(
			503,
			"LM Studio is not configured. Add its OpenAI-compatible URL to OPENAI_EXTRA_BASE_URLS."
		);
	}
	return cfg;
}

export async function lmStudioFetch(
	cfg: LmStudioConfig,
	path: string,
	init?: RequestInit
): Promise<Response> {
	return fetch(`${cfg.base}${path}`, {
		...init,
		headers: {
			...(init?.headers ?? {}),
			...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
		},
	});
}
