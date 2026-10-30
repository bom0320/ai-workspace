import { randomUUID } from "node:crypto";
import { closeSync, openSync, readSync, writeSync } from "node:fs";
import { isatty } from "node:tty";

// Opaque, process-local, single-use confirmation from the controlling terminal.
// Serialized objects and booleans cannot substitute for this receipt.
export type HumanConfirmation = Readonly<{ token: string }>;
const receipts = new WeakMap<
  HumanConfirmation,
  { binding: string; uid: number; confirmedAt: string; id: string }
>();

export function confirmHumanAction(
  binding: string,
  review: string
): HumanConfirmation | null {
  let fd: number | undefined;
  try {
    if (!process.getuid) return null;
    fd = openSync("/dev/tty", "r+");
    if (!isatty(fd)) return null;
    const token = randomUUID();
    const visible = review.replace(
      /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
    );
    writeSync(
      fd,
      `--- Review data ---\n${visible}\n--- End review ---\nType Approve ${token} to confirm; any other input rejects:\n`
    );
    let line = "";
    let submitted = false;
    const byte = Buffer.alloc(1);
    while (line.length < 128 && readSync(fd, byte, 0, 1, null) === 1) {
      if (byte[0] === 10) {
        submitted = true;
        break;
      }
      line += byte.toString("utf8");
    }
    if (!submitted || line.trim() !== `Approve ${token}`) return null;
    const receipt = Object.freeze({ token });
    receipts.set(receipt, {
      binding,
      uid: process.getuid(),
      confirmedAt: new Date().toISOString(),
      id: randomUUID(),
    });
    return receipt;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function consumeHumanConfirmation(
  receipt: HumanConfirmation | undefined,
  binding: string
) {
  if (!receipt) return undefined;
  const evidence = receipts.get(receipt);
  receipts.delete(receipt);
  if (evidence?.binding !== binding) return undefined;
  const { binding: _binding, ...record } = evidence;
  return record;
}
