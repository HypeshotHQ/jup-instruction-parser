import { IdlEvents, IdlTypes } from "@coral-xyz/anchor";
import { Jupiter } from "./idl/jupiter";
import { ParsedInstruction, PublicKey } from "@solana/web3.js";

export type SwapEvent = IdlEvents<Jupiter>["SwapEvent"];
export type FeeEvent = IdlEvents<Jupiter>["FeeEvent"];
type RoutePlanStep = IdlTypes<Jupiter>["RoutePlanStep"];
export type RoutePlan = RoutePlanStep[];

export interface PartialInstruction {
	programId: PublicKey;
	data: string /** Expecting base58 */;
	accounts: PublicKey[];
}

/** The fields of a web3.js `TokenBalance` that `extract()` reads. */
export interface TokenBalance {
	accountIndex: number;
	mint: string;
	owner?: string;
	uiTokenAmount?: { decimals: number };
}

// Subset of @solana/web3.js ParsedTransactionWithMeta to allow flexible upstream data
export interface TransactionWithMeta {
	meta: {
		logMessages?: string[] | null;
		preTokenBalances?: TokenBalance[] | null;
		postTokenBalances?: TokenBalance[] | null;
		innerInstructions?:
			| {
					index: number;
					instructions: (ParsedInstruction | PartialInstruction)[];
			  }[]
			| null;
	} | null;
	transaction: {
		signatures: string[];
		message: {
			accountKeys: { pubkey: PublicKey }[];
			instructions: (ParsedInstruction | PartialInstruction)[];
		};
	};
}
