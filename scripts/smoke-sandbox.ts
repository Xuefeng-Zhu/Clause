// Live smoke test of the Clause flow against the Airwallex sandbox.
// Usage: AWX_CLIENT_ID=... AWX_API_KEY=... [AWX_CARDHOLDER_ID=...] pnpm smoke:sandbox
import { readFileSync } from "node:fs";
import { SandboxIssuingGateway } from "../server/clause/airwallex/sandbox.js";
import { summarize } from "../server/clause/app.js";
import { config } from "../server/clause/config.js";
import { ContractCardService } from "../server/clause/milestones/service.js";
import { MemoryJobStore } from "../server/clause/store/jobStore.js";

config.awx.mode = "sandbox";
config.awx.clientId = process.env.AWX_CLIENT_ID ?? "";
config.awx.apiKey = process.env.AWX_API_KEY ?? "";
config.awx.cardholderId = process.env.AWX_CARDHOLDER_ID;
config.anthropic.apiKey = undefined; // offline fixture parsing + deterministic explainer

const quote = readFileSync(new URL("../samples/quote-maple-street-cafe.txt", import.meta.url), "utf8");
const email = readFileSync(new URL("../samples/change-order-email.txt", import.meta.url), "utf8");
const svc = new ContractCardService(new SandboxIssuingGateway(), new MemoryJobStore(), "frankzhu94+clause@outlook.com");
const log = (step: string, x: unknown) => console.log(`\n== ${step}\n`, JSON.stringify(x, null, 1).slice(0, 600));

let job = await svc.createJob({ kind: "text", text: quote });
log("1 parsed", { status: job.status, ref: job.terms.contract_ref });
job = await svc.approveTerms(job.id);
log("2 card issued", { card: job.card_id, ...summarize(job) });
log("3 lumber $1,180 @5211", (await svc.simulateCharge(job.id, { amount: 1180, merchant_name: "Dunn Lumber", mcc: "5211" })).explanation ?? "APPROVED");
log("4 lunch $86.40 @5812", (await svc.simulateCharge(job.id, { amount: 86.4, merchant_name: "Taphouse", mcc: "5812" })).explanation);
log("5 over limit $3,000 @5211", (await svc.simulateCharge(job.id, { amount: 3000, merchant_name: "Dunn Lumber", mcc: "5211" })).explanation);
job = await svc.submitProof(job.id, [{ filename: "cabinets.jpg", mediaType: "image/jpeg", base64: "AA==", declaredKind: "photos" }]);
log("6 proof verdict", job.pending?.verdict);
job = await svc.approveRelease(job.id, { approval_id: job.pending!.approval_id, milestone_id: "M2", amount: 5000 });
log("7 M2 released", summarize(job));
log("7b Home Depot $2,500 @5200", (await svc.simulateCharge(job.id, { amount: 2500, merchant_name: "Home Depot", mcc: "5200" })).explanation ?? "APPROVED");
job = await svc.proposeChangeOrder(job.id, email);
job = await svc.approveChangeOrder(job.id, job.pending!.approval_id);
log("8 change order applied", summarize(job));
const card = await new SandboxIssuingGateway().getCard(summarize(job).cardId!);
log("9 live card controls", card.authorization_controls);
job = await svc.closeJob(job.id);
log("done", { status: job.status });
