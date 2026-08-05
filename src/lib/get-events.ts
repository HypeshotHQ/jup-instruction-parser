import { BN, Event, Program, utils } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { JUPITER_V6_PROGRAM_ID } from "../constants";
import { TransactionWithMeta } from "../types";

// SwapsEvent discriminator
const SWAPS_EVENT_DISC = new Uint8Array([152, 47, 78, 235, 192, 96, 110, 106]);

const SWAP_EVENT_V2_SIZE_NO_AMM = 32 + 8 + 32 + 8; // 80
const SWAP_EVENT_V2_SIZE_WITH_AMM = SWAP_EVENT_V2_SIZE_NO_AMM + 32; // 112

function discEquals(a: Uint8Array, b: Uint8Array) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function readU32LE(data: Uint8Array, offset: number) {
	return (
		(data[offset] |
			(data[offset + 1] << 8) |
			(data[offset + 2] << 16) |
			(data[offset + 3] << 24)) >>>
		0
	);
}

/**
 * SwapEventV2 exists in two on-chain layouts:
 * - legacy: inputMint, inputAmount, outputMint, outputAmount
 * - new:    inputMint, inputAmount, outputMint, outputAmount, amm
 *
 * The published IDL only describes the new layout, so Anchor mis-decodes
 * legacy SwapsEvent payloads. Pick the layout by exact byte-length fit.
 */
function decodeSwapsEvent(eventData: Uint8Array): Event | null {
	if (
		eventData.length < 12 ||
		!discEquals(eventData.subarray(0, 8), SWAPS_EVENT_DISC)
	) {
		return null;
	}

	let offset = 8;
	const count = readU32LE(eventData, offset);
	offset += 4;

	const remaining = eventData.length - offset;
	let hasAmm: boolean;
	if (remaining === count * SWAP_EVENT_V2_SIZE_WITH_AMM) {
		hasAmm = true;
	} else if (remaining === count * SWAP_EVENT_V2_SIZE_NO_AMM) {
		hasAmm = false;
	} else {
		return null;
	}

	const swapEvents = [];
	for (let i = 0; i < count; i++) {
		const inputMint = new PublicKey(eventData.subarray(offset, offset + 32));
		offset += 32;
		const inputAmount = new BN(eventData.subarray(offset, offset + 8), "le");
		offset += 8;
		const outputMint = new PublicKey(eventData.subarray(offset, offset + 32));
		offset += 32;
		const outputAmount = new BN(eventData.subarray(offset, offset + 8), "le");
		offset += 8;

		const swapEvent: {
			inputMint: PublicKey;
			inputAmount: BN;
			outputMint: PublicKey;
			outputAmount: BN;
			amm?: PublicKey;
		} = { inputMint, inputAmount, outputMint, outputAmount };

		if (hasAmm) {
			swapEvent.amm = new PublicKey(eventData.subarray(offset, offset + 32));
			offset += 32;
		}

		swapEvents.push(swapEvent);
	}

	return {
		name: "SwapsEvent",
		data: { swapEvents },
	} as Event;
}

export function getEvents(
	program: Program,
	transactionResponse: TransactionWithMeta,
) {
	let events: Event[] = [];

	if (transactionResponse && transactionResponse.meta) {
		let { meta } = transactionResponse;

		meta.innerInstructions?.map(async ix => {
			ix.instructions.map(async iix => {
				if (!iix.programId.equals(JUPITER_V6_PROGRAM_ID)) return;
				if (!("data" in iix)) return; // Guard in case it is a parsed decoded instruction

				const ixData = utils.bytes.bs58.decode(iix.data);
				// Strip Anchor self-CPI instruction discriminator; remaining is event disc + data
				const eventBytes = ixData.subarray(8);

				const swapsEvent = decodeSwapsEvent(Uint8Array.from(eventBytes));
				if (swapsEvent) {
					events.push(swapsEvent);
					return;
				}

				const event = program.coder.events.decode(
					utils.bytes.base64.encode(eventBytes),
				);

				if (!event) return;

				events.push(event);
			});
		});
	}

	return events;
}
