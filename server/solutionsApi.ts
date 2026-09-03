import { nanoid } from "nanoid";
import { applyPromptTemplate, completeSolutionPrompt, loadSolutionPromptTemplate } from "./chatCompletions.js";

const MAX_CONTENT_BYTES = 256 * 1024;

export type ApiResult = {
  status: number;
  body: Record<string, unknown>;
};

export type GitHubConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  directory: string;
  commitMessage: string;
  apiBase: string;
};

function jsonError(status: number, message: string, extra?: Record<string, unknown>): ApiResult {
  return { status, body: { ok: false, error: message, ...extra } };
}

function sanitizeDirectory(raw: string): string | null {
  const cleaned = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!cleaned || cleaned.includes("..") || !/^[A-Za-z0-9._/-]+$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

const DEFAULT_REPO = "Chegu-Pavanaditya-Sairam/senderra-idp-sol";
const DEFAULT_BRANCH = "main";
const DEFAULT_DIRECTORY = "analyzers/out";

function parseRepoRef(raw: string): { owner: string; repo: string } | null {
  const value = raw.trim().replace(/\.git$/i, "");
  const urlMatch = value.match(/github\.com[:/]+([^/]+)\/([^/]+)/i);
  const slug = urlMatch ? `${urlMatch[1]}/${urlMatch[2]}` : value.replace(/^\/+|\/+$/g, "");
  const parts = slug.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(parts[0]) || !/^[A-Za-z0-9._-]+$/.test(parts[1])) return null;
  return { owner: parts[0], repo: parts[1] };
}

export function readGitHubConfig(): GitHubConfig | ApiResult {
  const token = process.env.GITHUB_TOKEN?.trim();
  const parsedRepo = parseRepoRef(
    process.env.GITHUB_REPO?.trim() ||
      [process.env.GITHUB_OWNER?.trim(), process.env.GITHUB_REPOSITORY?.trim()].filter(Boolean).join("/") ||
      DEFAULT_REPO
  );

  if (!token) {
    return jsonError(503, "GitHub is not configured. Set GITHUB_TOKEN on the server.");
  }
  if (!parsedRepo) {
    return jsonError(500, "GITHUB_REPO must be owner/repository or a GitHub URL.");
  }
  const { owner, repo } = parsedRepo;

  const branch = (process.env.GITHUB_BRANCH?.trim() || DEFAULT_BRANCH).replace(/^refs\/heads\//, "");
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..")) {
    return jsonError(500, "GITHUB_BRANCH is invalid.");
  }

  const directory = sanitizeDirectory(process.env.GITHUB_SOLUTIONS_DIR?.trim() || DEFAULT_DIRECTORY);
  if (!directory) {
    return jsonError(500, "GITHUB_SOLUTIONS_DIR is invalid.");
  }

  const apiBase = (process.env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(/\/+$/, "");
  if (!/^https:\/\//i.test(apiBase)) {
    return jsonError(500, "GITHUB_API_URL must be an https URL.");
  }

  const commitMessage = process.env.GITHUB_COMMIT_MESSAGE?.trim() || "Add solution from PACCA Vision";

  return { token, owner, repo, branch, directory, commitMessage, apiBase };
}

function parseContent(body: unknown): { content: string } | ApiResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Request body must be a JSON object.");
  }
  const content = (body as { content?: unknown }).content;
  if (typeof content !== "string") {
    return jsonError(400, "Solution text is required.");
  }
  const trimmed = content.replace(/\u0000/g, "").trim();
  if (!trimmed) {
    return jsonError(400, "Enter solution text before creating.");
  }
  const bytes = Buffer.byteLength(trimmed, "utf8");
  if (bytes > MAX_CONTENT_BYTES) {
    return jsonError(400, `Solution text exceeds the ${MAX_CONTENT_BYTES} byte limit.`);
  }
  return { content: trimmed };
}

function fileName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${nanoid(8)}.txt`;
}

function commitMessageFor(template: string, filePath: string): string {
  return template.replaceAll("{path}", filePath).replaceAll("{filename}", filePath.split("/").pop() ?? filePath);
}

type GitHubErrorBody = { message?: string; errors?: Array<{ code?: string; message?: string }> };

export async function githubJson(
  config: GitHubConfig,
  method: string,
  urlPath: string,
  payload?: Record<string, unknown>
): Promise<{ status: number; json: GitHubErrorBody & Record<string, unknown> }> {
  const response = await fetch(`${config.apiBase}${urlPath}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pacca-vision",
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await response.text();
  let json: GitHubErrorBody & Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as GitHubErrorBody & Record<string, unknown>;
    } catch {
      json = { message: text.slice(0, 300) };
    }
  }
  return { status: response.status, json };
}

function mapGitHubError(status: number, json: GitHubErrorBody): ApiResult {
  const message = json.message || "GitHub request failed.";
  if (status === 401 || status === 403) {
    return jsonError(502, "GitHub authentication failed. Check GITHUB_TOKEN and repository permissions.", {
      githubStatus: status,
    });
  }
  if (status === 404) {
    return jsonError(502, "GitHub repository, branch, or path was not found. Check GITHUB_REPO and GITHUB_BRANCH.", {
      githubStatus: status,
    });
  }
  if (status === 409 || status === 422) {
    const duplicate = /sha|already exists|invalid request/i.test(message);
    return jsonError(
      duplicate ? 409 : 502,
      duplicate ? "A file already exists at this path. Try creating the solution again." : message,
      { githubStatus: status }
    );
  }
  return jsonError(502, "GitHub rejected the request.", { githubStatus: status });
}

export async function createSolution(body: unknown): Promise<ApiResult> {
  const parsed = parseContent(body);
  if ("status" in parsed) return parsed;

  const loadedTemplate = loadSolutionPromptTemplate();
  if ("ok" in loadedTemplate) {
    return jsonError(loadedTemplate.status, loadedTemplate.error);
  }

  const completion = await completeSolutionPrompt(applyPromptTemplate(loadedTemplate.template, parsed.content));
  if (!completion.ok) {
    return jsonError(completion.status, completion.error);
  }

  const config = readGitHubConfig();
  if ("status" in config) return config;

  const name = fileName();
  const filePath = `${config.directory}/${name}`;
  const encoded = Buffer.from(completion.text, "utf8").toString("base64");

  try {
    const created = await githubJson(
      config,
      "PUT",
      `/repos/${config.owner}/${config.repo}/contents/${filePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`,
      {
        message: commitMessageFor(config.commitMessage, filePath),
        content: encoded,
        branch: config.branch,
      }
    );

    if (created.status === 201 || created.status === 200) {
      const htmlUrl =
        typeof created.json.content === "object" &&
        created.json.content &&
        "html_url" in (created.json.content as object)
          ? String((created.json.content as { html_url?: string }).html_url ?? "")
          : "";
      const commitSha =
        typeof created.json.commit === "object" && created.json.commit && "sha" in (created.json.commit as object)
          ? String((created.json.commit as { sha?: string }).sha ?? "")
          : "";
      return {
        status: 201,
        body: {
          ok: true,
          path: filePath,
          branch: config.branch,
          repository: `${config.owner}/${config.repo}`,
          htmlUrl: htmlUrl || undefined,
          commitSha: commitSha || undefined,
          model: completion.model,
        },
      };
    }

    return mapGitHubError(created.status, created.json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return jsonError(502, "Could not reach GitHub. Check network connectivity and GITHUB_API_URL.", {
      detail,
    });
  }
}

export async function readGitHubFile(repoPath: string): Promise<{ content: string } | ApiResult> {
  const config = readGitHubConfig();
  if ("status" in config) return config;
  const encoded = repoPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  try {
    const result = await githubJson(
      config,
      "GET",
      `/repos/${config.owner}/${config.repo}/contents/${encoded}?ref=${encodeURIComponent(config.branch)}`
    );
    if (result.status !== 200) return mapGitHubError(result.status, result.json);
    const encodedContent = typeof result.json.content === "string" ? result.json.content : "";
    if (!encodedContent) return jsonError(502, `GitHub file ${repoPath} had no content.`);
    return { content: Buffer.from(encodedContent.replace(/\n/g, ""), "base64").toString("utf8") };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return jsonError(502, "Could not reach GitHub. Check network connectivity and GITHUB_API_URL.", {
      detail,
    });
  }
}

export type GitHubDirEntry = { path: string; type: "file" | "dir"; size?: number };

export async function listGitHubPath(repoPath: string): Promise<{ entries: GitHubDirEntry[] } | ApiResult> {
  const config = readGitHubConfig();
  if ("status" in config) return config;
  const encoded = repoPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  try {
    const result = await githubJson(
      config,
      "GET",
      `/repos/${config.owner}/${config.repo}/contents/${encoded}?ref=${encodeURIComponent(config.branch)}`
    );
    if (result.status !== 200) return mapGitHubError(result.status, result.json);
    if (!Array.isArray(result.json)) {
      const pathName = typeof result.json.path === "string" ? result.json.path : repoPath;
      const type = result.json.type === "file" ? "file" : "dir";
      return { entries: [{ path: pathName, type }] };
    }
    const entries: GitHubDirEntry[] = [];
    for (const item of result.json as Array<{ path?: string; type?: string; size?: number }>) {
      if (!item.path || (item.type !== "file" && item.type !== "dir")) continue;
      entries.push({ path: item.path, type: item.type, size: item.size });
    }
    return { entries };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return jsonError(502, "Could not reach GitHub. Check network connectivity and GITHUB_API_URL.", {
      detail,
    });
  }
}

export async function commitFilesToGitHub(
  files: Array<{ path: string; content: string }>,
  message: string,
  deletes: string[] = []
): Promise<ApiResult> {
  const config = readGitHubConfig();
  if ("status" in config) return config;
  if (!files.length && !deletes.length) return jsonError(400, "No files to commit.");

  const encodedBranch = config.branch
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const repo = `/repos/${config.owner}/${config.repo}`;

  try {
    const ref = await githubJson(config, "GET", `${repo}/git/ref/heads/${encodedBranch}`);
    const refOk = ref.status === 200 ? ref : await githubJson(config, "GET", `${repo}/git/refs/heads/${encodedBranch}`);
    if (refOk.status !== 200) return mapGitHubError(refOk.status, refOk.json);
    const headSha =
      typeof refOk.json.object === "object" && refOk.json.object && "sha" in (refOk.json.object as object)
        ? String((refOk.json.object as { sha?: string }).sha ?? "")
        : "";
    if (!headSha) return jsonError(502, "GitHub ref did not include a commit SHA.");

    const headCommit = await githubJson(config, "GET", `${repo}/git/commits/${headSha}`);
    if (headCommit.status !== 200) return mapGitHubError(headCommit.status, headCommit.json);
    const baseTree =
      typeof headCommit.json.tree === "object" &&
      headCommit.json.tree &&
      "sha" in (headCommit.json.tree as object)
        ? String((headCommit.json.tree as { sha?: string }).sha ?? "")
        : "";
    if (!baseTree) return jsonError(502, "GitHub commit did not include a tree SHA.");

    const treeItems: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
    for (const file of files) {
      const blob = await githubJson(config, "POST", `${repo}/git/blobs`, {
        content: file.content,
        encoding: "utf-8",
      });
      if (blob.status !== 201 && blob.status !== 200) return mapGitHubError(blob.status, blob.json);
      const blobSha = typeof blob.json.sha === "string" ? blob.json.sha : "";
      if (!blobSha) return jsonError(502, `GitHub did not return a blob SHA for ${file.path}.`);
      treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blobSha });
    }
    for (const pathName of deletes) {
      treeItems.push({ path: pathName, mode: "100644", type: "blob", sha: null });
    }

    const tree = await githubJson(config, "POST", `${repo}/git/trees`, {
      base_tree: baseTree,
      tree: treeItems,
    });
    if (tree.status !== 201 && tree.status !== 200) return mapGitHubError(tree.status, tree.json);
    const treeSha = typeof tree.json.sha === "string" ? tree.json.sha : "";
    if (!treeSha) return jsonError(502, "GitHub did not return a tree SHA.");

    const commit = await githubJson(config, "POST", `${repo}/git/commits`, {
      message,
      tree: treeSha,
      parents: [headSha],
    });
    if (commit.status !== 201 && commit.status !== 200) return mapGitHubError(commit.status, commit.json);
    const commitSha = typeof commit.json.sha === "string" ? commit.json.sha : "";
    if (!commitSha) return jsonError(502, "GitHub did not return a commit SHA.");

    const updated = await githubJson(config, "PATCH", `${repo}/git/refs/heads/${encodedBranch}`, {
      sha: commitSha,
    });
    if (updated.status !== 200) return mapGitHubError(updated.status, updated.json);

    return {
      status: 201,
      body: {
        ok: true,
        branch: config.branch,
        repository: `${config.owner}/${config.repo}`,
        commitSha,
        paths: files.map((file) => file.path),
        deleted: deletes,
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return jsonError(502, "Could not reach GitHub. Check network connectivity and GITHUB_API_URL.", {
      detail,
    });
  }
}
