import { createHash } from "node:crypto";
import bs58 from "bs58";

export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export type Launch = { signature: string; slot: number; mint: string; name: string; symbol: string; uri: string; instruction: "create" | "create_v2" };
type Instruction = { programId?: string; accounts?: string[]; data?: string; parsed?: unknown };
export type ParsedTx = {
  slot: number;
  meta?: { err?: unknown; innerInstructions?: { instructions?: Instruction[] }[] };
  transaction?: { signatures?: string[]; message?: { instructions?: Instruction[] } };
};
function discriminator(name: string): Buffer {
  return createHash("sha256").update("global:" + name).digest().subarray(0, 8);
}
function readString(data: Buffer, pos: number): [string, number] | null {
  if (pos + 4 > data.length) return null;
  const length = data.readUInt32LE(pos);
  if (length > 2048 || pos + 4 + length > data.length) return null;
  return [data.subarray(pos + 4, pos + 4 + length).toString("utf8"), pos + 4 + length];
}
export function decodeLaunches(tx: ParsedTx): Launch[] {
  if (tx.meta?.err || !tx.transaction?.signatures?.[0]) return [];
  const instructions = [...(tx.transaction.message?.instructions ?? []), ...(tx.meta?.innerInstructions ?? []).flatMap(x => x.instructions ?? [])];
  const result: Launch[] = [];
  for (const ix of instructions) {
    if (ix.programId !== PUMP_PROGRAM_ID || !ix.data || !ix.accounts?.[0]) continue;
    let bytes: Buffer;
    try { bytes = Buffer.from(bs58.decode(ix.data)); } catch { continue; }
    const kind = (["create", "create_v2"] as const).find(name => bytes.subarray(0, 8).equals(discriminator(name)));
    if (!kind) continue;
    let cursor = 8;
    const name = readString(bytes, cursor); if (!name) continue; cursor = name[1];
    const symbol = readString(bytes, cursor); if (!symbol) continue; cursor = symbol[1];
    const uri = readString(bytes, cursor); if (!uri) continue;
    if (!name[0] || !symbol[0] || !uri[0]) continue;
    result.push({ signature: tx.transaction.signatures[0], slot: tx.slot, mint: ix.accounts[0], name: name[0], symbol: symbol[0], uri: uri[0], instruction: kind });
  }
  return result;
}
