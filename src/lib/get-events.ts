import { Event, Program, utils, Provider } from "@coral-xyz/anchor";
import { IDL, Jupiter } from "../idl/jupiter";
import { ParsedTransactionWithMeta } from "@solana/web3.js";
import { JUPITER_V6_PROGRAM_ID } from "../constants";
import { TransactionWithMeta } from "../types";

const program = new Program<Jupiter>(
  IDL,
  JUPITER_V6_PROGRAM_ID,
  {} as Provider
);

export function getEvents(transactionResponse: TransactionWithMeta) {
  let events: Event[] = [];

  if (transactionResponse && transactionResponse.meta) {
    let { meta } = transactionResponse;

    meta.innerInstructions?.map(async (ix) => {
      ix.instructions.map(async (iix) => {
        if (!iix.programId.equals(JUPITER_V6_PROGRAM_ID)) return;
        if (!("data" in iix)) return; // Guard in case it is a parsed decoded instruction

        const ixData = utils.bytes.bs58.decode(iix.data);
        const eventData = utils.bytes.base64.encode(ixData.subarray(8));
        const event = program.coder.events.decode(eventData);

        if (!event) return;

        events.push(event);
      });
    });
  }

  return events;
}
