import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export type InstalledModel = {
	key: string;
	displayName?: string;
	sizeBytes?: number;
	loaded?: boolean;
};

export type DownloadJob = {
	jobId: string;
	model: string;
	quantization: string;
	status: "started" | "downloading" | "completed" | "error";
	message?: string;
	error?: string;
	downloadedBytes: number;
	totalSizeBytes?: number;
	bytesPerSecond?: number;
};

const HF_API = "https://huggingface.co/api/models";
const HF_RESOLVE = "https://huggingface.co";

const jobs = new Map<string, DownloadJob>();

const quantKey = (q: string): string => q.toLowerCase().replace(/[^a-z0-9]/g, "");

const defaultModelsDir = (): string => path.join(os.homedir(), ".lmstudio", "models");

const downloadDir = (): string => process.env.LMSTUDIO_MODELS_DIR ?? defaultModelsDir();

export const modelsDirs = (): string[] => {
	const dirs = [defaultModelsDir()];
	const extra = process.env.LMSTUDIO_MODELS_DIR;
	if (extra && path.resolve(extra) !== path.resolve(dirs[0])) {
		dirs.push(extra);
	}
	return dirs;
};

export async function listInstalledModels(): Promise<InstalledModel[]> {
	const out: InstalledModel[] = [];
	for (const dir of modelsDirs()) {
		await scanDir(dir, out);
	}
	return out;
}

async function scanDir(dir: string, out: InstalledModel[]): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await scanDir(full, out);
		} else if (entry.name.endsWith(".gguf") && !entry.name.endsWith(".part")) {
			const sizeBytes = (await stat(full).catch(() => null))?.size;
			out.push({ key: full, displayName: entry.name.replace(/\.gguf$/i, ""), sizeBytes });
		}
	}
}

export const getDownloadJob = (jobId: string): DownloadJob | undefined => jobs.get(jobId);

async function resolveGgufFile(repo: string, quantization: string): Promise<string | null> {
	const res = await fetch(`${HF_API}/${repo}?blobs=true`, { signal: AbortSignal.timeout(10_000) });
	if (!res.ok) return null;
	const json = (await res.json()) as {
		blobs?: { rfilename: string }[];
		siblings?: { rfilename: string }[];
	};
	const files = (json.blobs ?? json.siblings ?? [])
		.map((f) => f.rfilename)
		.filter((f) => f.endsWith(".gguf"));
	if (files.length === 0) return null;
	return (
		files.find((f) => quantKey(path.basename(f)).includes(quantKey(quantization))) ??
		(files.length === 1 ? files[0] : null)
	);
}

export async function startDownload(modelId: string, quantization: string): Promise<DownloadJob> {
	const gguf = await resolveGgufFile(modelId, quantization);
	if (!gguf) {
		return {
			jobId: "",
			model: modelId,
			quantization,
			status: "error",
			error: `not_found`,
			downloadedBytes: 0,
		};
	}

	const relative = path.join(modelId, path.basename(gguf));
	for (const dir of modelsDirs()) {
		const existing = await stat(path.join(dir, relative)).catch(() => null);
		if (existing?.isFile() && existing.size > 0) {
			return {
				jobId: "",
				model: modelId,
				quantization,
				status: "error",
				error: "already_downloaded",
				downloadedBytes: 0,
			};
		}
	}

	const destDir = path.join(downloadDir(), modelId);
	const destFile = path.join(destDir, path.basename(gguf));

	const job: DownloadJob = {
		jobId: crypto.randomUUID(),
		model: modelId,
		quantization,
		status: "downloading",
		downloadedBytes: 0,
		bytesPerSecond: 0,
	};
	jobs.set(job.jobId, job);

	void downloadToFile(
		job,
		`${HF_RESOLVE}/${modelId}/resolve/main/${gguf}`,
		destDir,
		destFile
	).catch((e) => {
		job.status = "error";
		job.error = e instanceof Error ? e.message : String(e);
	});

	return { ...job, status: "started" };
}

async function downloadToFile(
	job: DownloadJob,
	url: string,
	destDir: string,
	destFile: string
): Promise<void> {
	const res = await fetch(url);
	if (!res.ok || !res.body) {
		throw new Error(`Hugging Face responded with ${res.status}`);
	}

	job.totalSizeBytes = Number(res.headers.get("content-length")) || undefined;

	await mkdir(destDir, { recursive: true });
	const partFile = `${destFile}.part`;

	let lastTick = Date.now();
	let bytesSinceTick = 0;

	const counter = new Transform({
		transform(chunk: Buffer, _enc, cb) {
			job.downloadedBytes += chunk.length;
			bytesSinceTick += chunk.length;
			const now = Date.now();
			if (now - lastTick >= 500) {
				job.bytesPerSecond = Math.round((bytesSinceTick / Math.max(1, now - lastTick)) * 1000);
				bytesSinceTick = 0;
				lastTick = now;
			}
			cb(null, chunk);
		},
	});

	await pipeline(Readable.fromWeb(res.body as never), counter, createWriteStream(partFile));

	await rename(partFile, destFile);
	job.status = "completed";
	job.message = `Downloaded ${path.basename(destFile)}`;
	job.bytesPerSecond = 0;
}
