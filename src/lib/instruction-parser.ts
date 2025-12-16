import { ParsedInstruction, PublicKey } from "@solana/web3.js";
import { BorshCoder } from "@coral-xyz/anchor";
import { IDL } from "../idl/jupiter";
import { PartialInstruction, RoutePlan, TransactionWithMeta } from "../types";
import bs58 from "bs58";

export class InstructionParser {
	private coder: BorshCoder;
	private programId: PublicKey;

	constructor(programId: PublicKey) {
		this.programId = programId;
		this.coder = new BorshCoder(IDL);
	}

	getInstructionNameAndTransferAuthorityAndLastAccount(
		instructions: PartialInstruction[]
	) {
		for (const instruction of instructions) {
			if (!instruction.programId.equals(this.programId)) {
				continue;
			}

			const ix = this.coder.instruction.decode(instruction.data, "base58");

			if (this.isRouting(ix.name)) {
				const instructionName = ix.name;
				const transferAuthority =
					instruction.accounts[
						this.getTransferAuthorityIndex(instructionName)
					].toString();
				const lastAccount =
					instruction.accounts[instruction.accounts.length - 1].toString();

				return [ix.name, transferAuthority, lastAccount];
			}
		}

		return [];
	}

	getTransferAuthorityIndex(instructionName: string) {
		switch (instructionName) {
			case "route":
			case "exactOutRoute":
			case "routeWithTokenLedger":
			case "routeV2":
			case "exactOutRouteV2":
				return 0; // V2 instructions have userTransferAuthority at index 0
			case "sharedAccountsRoute":
			case "sharedAccountsRouteWithTokenLedger":
			case "sharedAccountsExactOutRoute":
			case "sharedAccountsRouteV2":
			case "sharedAccountsExactOutRouteV2":
				return 1; // V2 shared accounts have userTransferAuthority at index 1
		}
	}

	// For CPI, we have to also check for innerInstructions.
	getInstructions(tx: TransactionWithMeta): PartialInstruction[] {
		const parsedInstructions: PartialInstruction[] = [];
		for (const instruction of tx.transaction.message.instructions) {
			if (instruction.programId.equals(this.programId)) {
				parsedInstructions.push(instruction as any);
			}
		}

		for (const instructions of tx.meta.innerInstructions) {
			for (const instruction of instructions.instructions) {
				if (instruction.programId.equals(this.programId)) {
					parsedInstructions.push(instruction as any);
				}
			}
		}

		return parsedInstructions;
	}

	// Extract the position of the initial and final swap from the swap array.
	getInitialAndFinalSwapPositions(instructions: PartialInstruction[]) {
		for (const instruction of instructions) {
			if (!instruction.programId.equals(this.programId)) {
				continue;
			}

			const ix = this.coder.instruction.decode(instruction.data, "base58");
			// This will happen because now event is also an CPI instruction.
			if (!ix) {
				continue;
			}

			if (this.isRouting(ix.name)) {
				const routePlan = (ix.data as any).routePlan as RoutePlan;
				const inputIndex = 0;
				const outputIndex = routePlan.length;

				const initialPositions: number[] = [];
				for (let j = 0; j < routePlan.length; j++) {
					if (routePlan[j].inputIndex === inputIndex) {
						initialPositions.push(j);
					}
				}

				const finalPositions: number[] = [];
				for (let j = 0; j < routePlan.length; j++) {
					if (routePlan[j].outputIndex === outputIndex) {
						finalPositions.push(j);
					}
				}

				if (
					finalPositions.length === 0 &&
					this.isCircular((ix.data as any).routePlan)
				) {
					for (let j = 0; j < (ix.data as any).routePlan.length; j++) {
						if ((ix.data as any).routePlan[j].outputIndex === 0) {
							finalPositions.push(j);
						}
					}
				}

				return [initialPositions, finalPositions];
			}
		}
	}

	getExactOutAmount(instructions: (ParsedInstruction | PartialInstruction)[]) {
		for (const instruction of instructions) {
			if (!instruction.programId.equals(this.programId)) {
				continue;
			}
			if (!("data" in instruction)) continue; // Guard in case it is a parsed decoded instruction, should be impossible

			const ix = this.coder.instruction.decode(instruction.data, "base58");

			if (this.isExactIn(ix.name)) {
				return (ix.data as any).quotedOutAmount.toString();
			}
		}

		return;
	}

	getExactInAmount(instructions: (ParsedInstruction | PartialInstruction)[]) {
		for (const instruction of instructions) {
			if (!instruction.programId.equals(this.programId)) {
				continue;
			}
			if (!("data" in instruction)) continue; // Guard in case it is a parsed decoded instruction, should be impossible

			const ix = this.coder.instruction.decode(instruction.data, "base58");

			if (this.isExactOut(ix.name)) {
				return (ix.data as any).quotedInAmount.toString();
			}
		}

		return;
	}

	isExactIn(name: string) {
		return (
			name === "route" ||
			name === "routeWithTokenLedger" ||
			name === "sharedAccountsRoute" ||
			name === "sharedAccountsRouteWithTokenLedger" ||
			name === "routeV2" ||
			name === "sharedAccountsRouteV2"
		);
	}

	isExactOut(name: string) {
		return (
			name === "sharedAccountsExactOutRoute" ||
			name === "exactOutRoute" ||
			name === "exactOutRouteV2" ||
			name === "sharedAccountsExactOutRouteV2"
		);
	}

	isRouting(name: string) {
		return (
			name === "route" ||
			name === "routeWithTokenLedger" ||
			name === "sharedAccountsRoute" ||
			name === "sharedAccountsRouteWithTokenLedger" ||
			name === "sharedAccountsExactOutRoute" ||
			name === "exactOutRoute" ||
			name === "routeV2" ||
			name === "exactOutRouteV2" ||
			name === "sharedAccountsRouteV2" ||
			name === "sharedAccountsExactOutRouteV2"
		);
	}

	decodeInstruction(data: string) {
		try {
			// First check if we have valid base58 data
			if (!data || data.length === 0) {
				throw new Error("Empty instruction data");
			}

			// Decode the base58 data
			const decoded = this.coder.instruction.decode(data, "base58");

			// Validate the decoded instruction
			if (!decoded || !decoded.name) {
				throw new Error("Invalid instruction format");
			}

			return decoded;
		} catch (error) {
			console.error("Error decoding instruction:", error);
			// Return a safe default object instead of throwing
			return {
				name: "unknown",
				data: {},
			};
		}
	}

	isCircular(routePlan: RoutePlan) {
		if (!routePlan || routePlan.length === 0) {
			return false; // Empty or null array is not circular
		}

		const indexMap = new Map(
			routePlan.map(obj => [obj.inputIndex, obj.outputIndex])
		);
		let visited = new Set();
		let currentIndex = routePlan[0].inputIndex; // Start from the first object's inputIndex

		while (true) {
			if (visited.has(currentIndex)) {
				return currentIndex === routePlan[0].inputIndex;
			}

			visited.add(currentIndex);

			if (!indexMap.has(currentIndex)) {
				return false; // No further mapping, not circular
			}

			currentIndex = indexMap.get(currentIndex);
		}
	}
}
