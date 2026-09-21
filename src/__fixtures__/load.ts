import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";

type Rec = Record<string, any>;
const toKey = (v: unknown) => (typeof v === "string" ? new PublicKey(v) : v);
const hydrateIx = (ix: Rec) => ({
	...ix,
	...("programId" in ix ? { programId: toKey(ix.programId) } : {}),
	...(Array.isArray(ix.accounts) ? { accounts: ix.accounts.map(toKey) } : {}),
});

/**
 * A real mainnet transaction as `getTransaction(jsonParsed)` returned it,
 * brought to the web3.js shape `extract()` reads (keys and program ids as
 * PublicKey), the same way hype-backend's `hydrateParsedTransaction` does.
 */
export function loadParsedTransaction(name: string): any {
	const raw: Rec = JSON.parse(
		readFileSync(join(__dirname, `${name}.parsed.json`), "utf8"),
	);
	const message = raw.transaction.message;
	return {
		...raw,
		transaction: {
			...raw.transaction,
			message: {
				...message,
				accountKeys: message.accountKeys.map((k: Rec) => ({ ...k, pubkey: toKey(k.pubkey) })),
				instructions: message.instructions.map(hydrateIx),
			},
		},
		meta: {
			...raw.meta,
			innerInstructions: (raw.meta.innerInstructions ?? []).map((e: Rec) => ({
				...e,
				instructions: e.instructions.map(hydrateIx),
			})),
		},
	};
}

/** Answers `getMultipleAccountsInfo` from the accounts captured with the transaction. */
export function fixtureConnection(name: string): Connection & { requested: string[][] } {
	const accounts: Rec = JSON.parse(
		readFileSync(join(__dirname, `${name}.accounts.json`), "utf8"),
	);
	const requested: string[][] = [];
	return {
		requested,
		async getMultipleAccountsInfo(keys: PublicKey[]) {
			requested.push(keys.map((k) => k.toBase58()));
			return keys.map((k): AccountInfo<Buffer> | null => {
				const a = accounts[k.toBase58()];
				if (!a) return null;
				return {
					lamports: a.lamports,
					owner: new PublicKey(a.owner),
					executable: a.executable,
					rentEpoch: a.rentEpoch,
					data: Buffer.from(a.data[0], "base64"),
				};
			});
		},
	} as any;
}
