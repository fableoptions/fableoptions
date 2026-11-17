import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import bs58 from "bs58";

const DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
export function isSolanaPublicKey(wallet: unknown): wallet is string {
  if (typeof wallet !== "string" || !BASE58.test(wallet) || wallet.length > 44 || wallet.length < 32) return false;
  try { return bs58.decode(wallet).length === 32; } catch { return false; }
}
export function newNonce(): string { return randomBytes(24).toString("hex"); }
export function signingMessage(wallet:string, nonce:string, action:"request"|"quote", payload:unknown):string {
  if (!isSolanaPublicKey(wallet) || !/^[a-f0-9]{48}$/.test(nonce)) throw new Error("Invalid signature parameters");
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return ["Fable Options RFQ v1", "Network: solana-mainnet", "Wallet: "+wallet,
    "Action: "+action, "Nonce: "+nonce, "Payload-SHA256: "+digest,
    "This is an INDICATIVE request only; it does not send funds or execute an option."].join("\n");
}
export function verifySignedPayload(wallet:string, nonce:string, action:"request"|"quote", payload:unknown, signature:string):boolean {
  if (!isSolanaPublicKey(wallet) || typeof signature !== "string") return false;
  try {
    const sig = bs58.decode(signature);
    if (sig.length !== 64) return false;
    const publicKey = createPublicKey({ key: Buffer.concat([DER_PREFIX, Buffer.from(bs58.decode(wallet))]), format:"der",type:"spki" });
    return verify(null,Buffer.from(signingMessage(wallet,nonce,action,payload),"utf8"),publicKey,Buffer.from(sig));
  } catch { return false; }
}
