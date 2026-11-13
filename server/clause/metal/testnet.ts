import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { noteExternalWrite } from "@agent-native/core/action";
import {
  type JobWithMandateRef,
  type MandateIssueResult,
  type MandatePayoutRequest,
  type MandatePayoutResult,
  type MandateStatusResult,
  type MandateTerms,
  type MandateVerifyResult,
  type MetalRail,
  round2,
} from "./types.js";

const DEFAULT_METAL_DIR = "/workspace/work/metal";
const DEFAULT_CLI_PREFIX = "/workspace/tools/metal";

export interface ParsedMetalCliOutput {
  mandateId?: string;
  txHash?: string;
  outcome?: string;
  reason?: string;
  reasonDetail?: string;
  explorerUrl?: string;
  spent?: number;
  budget?: number;
  payments?: number;
  maxOccurrences?: number;
  cap?: number;
  payee?: string;
  bound?: boolean;
  revoked?: boolean;
  verified?: boolean;
  verifyPayments?: number;
  verifyRefusals?: number;
}

/**
 * Pure line parser for `metal-agent mandate` CLI key-value output.
 */
export function parseMetalCliOutput(raw: string): ParsedMetalCliOutput {
  const out: ParsedMetalCliOutput = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const verifyCounts = /(\d+)\s+payment\(s\)\s+and\s+(\d+)\s+refusal\(s\)/i.exec(line);
    if (verifyCounts) {
      out.verifyPayments = Number(verifyCounts[1]);
      out.verifyRefusals = Number(verifyCounts[2]);
    }

    const spaceIdx = line.indexOf(" ");
    if (spaceIdx <= 0) continue;
    const key = line.slice(0, spaceIdx).trim();
    const val = line.slice(spaceIdx + 1).trim();

    switch (key) {
      case "mandate":
        if (val.startsWith("0x")) out.mandateId = val.split(/\s+/)[0]!;
        break;
      case "transaction":
        if (val.startsWith("0x")) out.txHash = val.split(/\s+/)[0]!;
        break;
      case "outcome":
        out.outcome = val;
        break;
      case "reason": {
        const m = /^([a-z0-9_]+)(?:\s*\((.+)\))?/i.exec(val);
        if (m) {
          out.reason = m[1]!;
          if (m[2]) out.reasonDetail = m[2];
        } else {
          out.reason = val;
        }
        break;
      }
      case "explorer":
        out.explorerUrl = val;
        break;
      case "spent": {
        const m = /^([0-9]+(?:\.[0-9]+)?)\s+\*USDZ\s+of\s+([0-9]+(?:\.[0-9]+)?)\s+\*USDZ/i.exec(val);
        if (m) {
          out.spent = round2(Number(m[1]));
          out.budget = round2(Number(m[2]));
        }
        break;
      }
      case "payments":
        if (/^\d+$/.test(val)) out.payments = Number(val);
        break;
      case "max-occurrences":
        if (/^\d+$/.test(val)) out.maxOccurrences = Number(val);
        break;
      case "per-payment-cap": {
        const m = /^([0-9]+(?:\.[0-9]+)?)\s+\*USDZ/i.exec(val);
        if (m) out.cap = round2(Number(m[1]));
        break;
      }
      case "budget": {
        const m = /^([0-9]+(?:\.[0-9]+)?)\s+\*USDZ/i.exec(val);
        if (m && out.budget === undefined) out.budget = round2(Number(m[1]));
        break;
      }
      case "payee": {
        const p = val.split(/\s+/)[0];
        if (p) out.payee = p;
        break;
      }
      case "bound":
        out.bound = val.toLowerCase() === "yes";
        break;
      case "revoked":
        out.revoked = val.toLowerCase() === "yes";
        break;
      case "verified":
        out.verified = val.toLowerCase() === "yes";
        break;
    }
  }
  return out;
}

function formatUsdzArg(amount: number): string {
  const rounded = round2(amount);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function sanitizeJobId(jobId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    throw new Error(`Invalid job id for Metal credential path: ${jobId}`);
  }
  return jobId;
}

function redactSecret(text: string, secret?: string): string {
  if (!secret || secret.length < 6) return text;
  return text.split(secret).join("[REDACTED_METAL_RPC_URL]");
}

export interface TestnetMetalRailOptions {
  metalDir?: string | undefined;
  cliPrefix?: string | undefined;
  account?: string | undefined;
  rpcUrl?: string | undefined;
}

export class TestnetMetalRail implements MetalRail {
  readonly mode = "testnet" as const;
  private readonly metalDir: string;
  private readonly cliPrefix: string;
  private readonly account: string;
  private readonly rpcUrl: string;
  private readonly localRefusals = new Map<string, number>();

  constructor(opts: TestnetMetalRailOptions = {}) {
    this.metalDir = path.resolve(
      opts.metalDir || process.env.METAL_DIR || DEFAULT_METAL_DIR, // guard:allow-no-env-credentials — deploy-level directory path outside repo
    );
    this.cliPrefix =
      opts.cliPrefix || process.env.METAL_CLI_PREFIX || DEFAULT_CLI_PREFIX; // guard:allow-no-env-credentials — deploy-level CLI path
    this.account =
      opts.account || process.env.METAL_ACCOUNT || ""; // guard:allow-no-env-credentials — public on-chain principal address
    this.rpcUrl =
      opts.rpcUrl || process.env.METAL_RPC_URL || ""; // guard:allow-no-env-credentials — testnet RPC endpoint passed to metal-agent subprocess

    const repoRoot = path.resolve(process.cwd());
    if (this.metalDir === repoRoot || this.metalDir.startsWith(`${repoRoot}${path.sep}`)) {
      throw new Error(`Refusing to store Metal keys/credentials inside repository (${this.metalDir}).`);
    }
    if (!this.account || !this.rpcUrl) {
      throw new Error("TestnetMetalRail requires METAL_ACCOUNT and METAL_RPC_URL.");
    }
  }

  private jobDir(jobId: string): string {
    return path.join(this.metalDir, "jobs", sanitizeJobId(jobId));
  }

  private credentialPathFor(job: JobWithMandateRef, version?: number): string {
    const dir = this.jobDir(job.id);
    if (version !== undefined) {
      return version <= 1 ? path.join(dir, "mandate.json") : path.join(dir, `mandate-v${version}.json`);
    }
    if (job.mandate?.credentialFile) return job.mandate.credentialFile;
    const v = job.mandate?.version ?? 1;
    return v <= 1 ? path.join(dir, "mandate.json") : path.join(dir, `mandate-v${v}.json`);
  }

  private mandateKeyPath(jobId: string): string {
    return path.join(this.jobDir(jobId), "mandate.key.json");
  }

  private ownerKeyPath(): string {
    return path.join(this.metalDir, "owner-key.json");
  }

  private issuerPublicKeyPath(): string {
    return path.join(this.metalDir, "owner-key.issuer.public.json");
  }

  private async runCli(
    args: string[],
    opts: { mutating: boolean },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    if (opts.mutating) {
      noteExternalWrite("metal-testnet");
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      METAL_ACCOUNT: this.account,
      METAL_RPC_URL: this.rpcUrl,
      NODE_NO_WARNINGS: "1",
    };

    return await new Promise((resolve, reject) => {
      // observed-write-ok: mutating calls invoke noteExternalWrite("metal-testnet") above; status/verify are read-only
      execFile(
        "npx",
        ["--prefix", this.cliPrefix, "metal-agent", ...args, "--network", "testnet"],
        {
          env,
          timeout: 180_000,
          maxBuffer: 4 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const cleanStdout = redactSecret(String(stdout ?? ""), this.rpcUrl);
          const cleanStderr = redactSecret(String(stderr ?? ""), this.rpcUrl);
          if (!error) {
            resolve({ exitCode: 0, stdout: cleanStdout, stderr: cleanStderr });
            return;
          }
          const code = typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : 1;
          if ( (error as { killed?: boolean }).killed ) {
            reject(new Error(`metal-agent timed out on "${args.slice(0, 2).join(" ")}"`));
            return;
          }
          resolve({ exitCode: code, stdout: cleanStdout, stderr: cleanStderr });
        },
      );
    });
  }

  async issueMandate(job: JobWithMandateRef, terms: MandateTerms): Promise<MandateIssueResult> {
    const dir = this.jobDir(job.id);
    noteExternalWrite("metal-testnet");
    await mkdir(dir, { recursive: true });

    const credFile = this.credentialPathFor(job, 1);
    const ownerKey = this.ownerKeyPath();

    const createRes = await this.runCli(
      [
        "mandate",
        "credential",
        "create",
        "--principal",
        this.account,
        "--payee",
        `${terms.payee},Contractor`,
        "--cap",
        formatUsdzArg(terms.cap),
        "--budget",
        formatUsdzArg(terms.budget),
        "--max-occurrences",
        String(terms.maxOccurrences),
        "--expires-in",
        String(terms.expiresIn),
        "--description",
        terms.description,
        "--key",
        ownerKey,
        "--out",
        credFile,
      ],
      { mutating: true },
    );
    if (createRes.exitCode !== 0) {
      throw new Error(
        `metal-agent mandate credential create failed (${createRes.exitCode}): ${(createRes.stderr || createRes.stdout).trim()}`,
      );
    }

    const bindRes = await this.runCli(
      ["mandate", "bind", "--credential", credFile, "--key", ownerKey],
      { mutating: true },
    );
    if (bindRes.exitCode !== 0) {
      throw new Error(
        `metal-agent mandate bind failed (${bindRes.exitCode}): ${(bindRes.stderr || bindRes.stdout).trim()}`,
      );
    }

    const bindParsed = parseMetalCliOutput(`${bindRes.stdout}\n${bindRes.stderr}`);
    const statusRes = await this.status({ ...job, mandate: { mode: "testnet", mandateId: bindParsed.mandateId ?? "", version: 1, credentialFile: credFile, explorerUrl: bindParsed.explorerUrl ?? null, terms, spent: 0, budget: terms.budget, occurrencesUsed: 0, events: [] } });

    return {
      mandateId: bindParsed.mandateId ?? statusRes.mandateId,
      version: 1,
      credentialFile: credFile,
      ...(bindParsed.txHash ? { txHash: bindParsed.txHash } : {}),
      explorerUrl: bindParsed.explorerUrl ?? null,
      terms: structuredClone(terms),
      spent: statusRes.spent,
      budget: terms.budget,
      occurrencesUsed: statusRes.occurrencesUsed,
    };
  }

  async payout(job: JobWithMandateRef, req: MandatePayoutRequest): Promise<MandatePayoutResult> {
    const credFile = this.credentialPathFor(job);
    const keyFile = this.mandateKeyPath(job.id);
    const paymentId = req.paymentId || `${job.id}-${req.milestoneId}`;

    const args = [
      "mandate",
      "pull",
      "--credential",
      credFile,
      "--to",
      req.to,
      "--amount",
      formatUsdzArg(req.amount),
      "--payment-id",
      paymentId,
    ];
    if (existsSync(keyFile)) {
      args.push("--mandate-key-file", keyFile);
    }

    const res = await this.runCli(args, { mutating: true });
    const parsed = parseMetalCliOutput(`${res.stdout}\n${res.stderr}`);
    const outcomeLower = (parsed.outcome ?? "").toLowerCase();

    if (res.exitCode === 0 || outcomeLower === "paid") {
      return {
        outcome: "paid",
        ...(parsed.txHash ? { txHash: parsed.txHash } : {}),
        explorerUrl: parsed.explorerUrl ?? null,
        ...(parsed.spent !== undefined ? { spent: parsed.spent } : {}),
        ...(parsed.budget !== undefined ? { budget: parsed.budget } : {}),
      };
    }

    if (res.exitCode === 3 || outcomeLower.startsWith("pending")) {
      return {
        outcome: "pending",
        ...(parsed.txHash ? { txHash: parsed.txHash } : {}),
        explorerUrl: parsed.explorerUrl ?? null,
        ...(parsed.spent !== undefined ? { spent: parsed.spent } : {}),
        ...(parsed.budget !== undefined ? { budget: parsed.budget } : {}),
      };
    }

    if (outcomeLower.startsWith("refused") || parsed.reason) {
      this.localRefusals.set(job.id, (this.localRefusals.get(job.id) ?? 0) + 1);
      return {
        outcome: "refused",
        reason: parsed.reason ?? "mandate_refused",
        ...(parsed.reasonDetail ? { reasonDetail: parsed.reasonDetail } : {}),
        ...(parsed.txHash ? { txHash: parsed.txHash } : {}),
        explorerUrl: parsed.explorerUrl ?? null,
        ...(parsed.spent !== undefined ? { spent: parsed.spent } : job.mandate ? { spent: job.mandate.spent } : {}),
        ...(parsed.budget !== undefined ? { budget: parsed.budget } : job.mandate ? { budget: job.mandate.budget } : {}),
      };
    }

    throw new Error(
      `metal-agent mandate pull failed (${res.exitCode}): ${(res.stderr || res.stdout).trim()}`,
    );
  }

  async replaceMandate(job: JobWithMandateRef, newTerms: MandateTerms): Promise<MandateIssueResult> {
    const prevVersion = job.mandate?.version ?? 1;
    const oldFile = this.credentialPathFor(job, prevVersion);
    const nextVersion = prevVersion + 1;
    const newFile = this.credentialPathFor(job, nextVersion);
    const mandateKey = this.mandateKeyPath(job.id);
    const ownerKey = this.ownerKeyPath();

    const createArgs = [
      "mandate",
      "credential",
      "create",
      "--principal",
      this.account,
      "--payee",
      `${newTerms.payee},Contractor`,
      "--cap",
      formatUsdzArg(newTerms.cap),
      "--budget",
      formatUsdzArg(newTerms.budget),
      "--max-occurrences",
      String(newTerms.maxOccurrences),
      "--expires-in",
      String(newTerms.expiresIn),
      "--description",
      newTerms.description,
      "--key",
      ownerKey,
      "--out",
      newFile,
    ];
    if (existsSync(mandateKey)) {
      createArgs.push("--mandate-key-file", mandateKey);
    }

    const createRes = await this.runCli(createArgs, { mutating: true });
    if (createRes.exitCode !== 0) {
      throw new Error(
        `metal-agent credential create (v${nextVersion}) failed (${createRes.exitCode}): ${(createRes.stderr || createRes.stdout).trim()}`,
      );
    }

    const replaceRes = await this.runCli(
      ["mandate", "replace", "--credential", newFile, "--replaces", oldFile, "--key", ownerKey],
      { mutating: true },
    );
    if (replaceRes.exitCode !== 0) {
      throw new Error(
        `metal-agent mandate replace failed (${replaceRes.exitCode}): ${(replaceRes.stderr || replaceRes.stdout).trim()}`,
      );
    }

    const replaceParsed = parseMetalCliOutput(`${replaceRes.stdout}\n${replaceRes.stderr}`);
    const statusRes = await this.status({
      ...job,
      mandate: {
        mode: "testnet",
        mandateId: replaceParsed.mandateId ?? "",
        version: nextVersion,
        credentialFile: newFile,
        explorerUrl: replaceParsed.explorerUrl ?? null,
        terms: newTerms,
        spent: job.mandate?.spent ?? 0,
        budget: newTerms.budget,
        occurrencesUsed: job.mandate?.occurrencesUsed ?? 0,
        events: job.mandate?.events ?? [],
      },
    });

    return {
      mandateId: replaceParsed.mandateId ?? statusRes.mandateId,
      version: nextVersion,
      credentialFile: newFile,
      ...(replaceParsed.txHash ? { txHash: replaceParsed.txHash } : {}),
      explorerUrl: replaceParsed.explorerUrl ?? null,
      terms: structuredClone(newTerms),
      spent: statusRes.spent,
      budget: newTerms.budget,
      occurrencesUsed: statusRes.occurrencesUsed,
    };
  }

  async status(job: JobWithMandateRef): Promise<MandateStatusResult> {
    const credFile = this.credentialPathFor(job);
    const res = await this.runCli(["mandate", "status", "--credential", credFile], { mutating: false });
    if (res.exitCode !== 0) {
      throw new Error(
        `metal-agent mandate status failed (${res.exitCode}): ${(res.stderr || res.stdout).trim()}`,
      );
    }
    const parsed = parseMetalCliOutput(`${res.stdout}\n${res.stderr}`);
    return {
      mandateId: parsed.mandateId ?? job.mandate?.mandateId ?? "",
      bound: parsed.bound ?? true,
      revoked: parsed.revoked ?? false,
      spent: parsed.spent ?? job.mandate?.spent ?? 0,
      budget: parsed.budget ?? job.mandate?.budget ?? 0,
      occurrencesUsed: parsed.payments ?? job.mandate?.occurrencesUsed ?? 0,
      maxOccurrences: parsed.maxOccurrences ?? job.mandate?.terms.maxOccurrences ?? 0,
      cap: parsed.cap ?? job.mandate?.terms.cap ?? 0,
      payee: parsed.payee ?? job.mandate?.terms.payee ?? "",
    };
  }

  async verify(job: JobWithMandateRef): Promise<MandateVerifyResult> {
    const credFile = this.credentialPathFor(job);
    const issuerFile = this.issuerPublicKeyPath();
    const res = await this.runCli(
      ["mandate", "verify", "--credential", credFile, "--issuer", issuerFile],
      { mutating: false },
    );
    const parsed = parseMetalCliOutput(`${res.stdout}\n${res.stderr}`);
    const verified = res.exitCode === 0 && (parsed.verified ?? false);
    const jobRefusals = job.mandate?.events.filter((e) => e.outcome === "refused").length ?? 0;
    const payments = parsed.verifyPayments ?? job.mandate?.occurrencesUsed ?? 0;
    const refusals = Math.max(
      parsed.verifyRefusals ?? 0,
      this.localRefusals.get(job.id) ?? 0,
      jobRefusals,
    );
    const summary = verified
      ? `Verified on chain ✓ — ${payments} payments, ${refusals} refusals`
      : `On-chain verification failed — ${payments} payments, ${refusals} refusals`;

    return {
      verified,
      ...(parsed.mandateId ? { mandateId: parsed.mandateId } : job.mandate?.mandateId ? { mandateId: job.mandate.mandateId } : {}),
      payments,
      refusals,
      summary,
    };
  }
}
