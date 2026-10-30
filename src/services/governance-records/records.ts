import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, isAbsolute } from "node:path";

// Fixed, owner-private location outside target repositories. Same OS account is
// trusted; HMAC is integrity against untrusted inputs, not protection from owner.
function directory() {
  const home = homedir();
  const root = join(home, ".ai-workspace-governance");
  if (!existsSync(root)) mkdirSync(root, { mode: 0o700 });
  const stat = lstatSync(root);
  if (
    !process.getuid ||
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw new Error("Untrusted Governance store permissions.");
  return realpathSync(root);
}
function secureRead(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 0o077 ||
      stat.nlink !== 1 ||
      stat.size > 4 * 1024 * 1024
    )
      throw new Error("Untrusted Governance record.");
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}
export function assertGovernanceStoreOutsideRepository(
  repositoryRoot: string
): void {
  const path = relative(repositoryRoot, directory());
  if (!path.startsWith("..") && !isAbsolute(path))
    throw new Error("Governance store must be outside the target Repository.");
}

export function governanceDigest(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input !== null && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, canonical(val)])
      );
    return input;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

// Synchronous transaction: owner-private lock, signed read, atomic replacement.
// A conflicting/stale lock fails closed; never steals it or silently resets data.
export function withGovernanceRecords<T>(
  action: (data: unknown, save: (next: unknown) => void) => T
): T {
  const root = directory();
  const lock = join(root, "lock");
  mkdirSync(lock, { mode: 0o700 });
  try {
    const keyPath = join(root, "key");
    const dataPath = join(root, "records.json");
    const fresh = !existsSync(keyPath);
    if (fresh) {
      if (existsSync(dataPath))
        throw new Error("Missing Governance integrity key.");
      writeFileSync(keyPath, randomBytes(32).toString("hex"), {
        mode: 0o600,
        flag: "wx",
      });
    }
    const key = secureRead(keyPath);
    if (!/^[a-f0-9]{64}$/.test(key))
      throw new Error("Invalid Governance integrity key.");
    const sign = (payload: string) =>
      createHmac("sha256", key).update(payload).digest("hex");
    if (!existsSync(dataPath)) {
      if (!fresh)
        throw new Error(
          "Governance ledger is missing; refusing to reset approval history."
        );
      const payload = JSON.stringify({ repositories: {} });
      writeFileSync(
        dataPath,
        JSON.stringify({ payload, signature: sign(payload) }),
        { mode: 0o600, flag: "wx" }
      );
    }
    let data: unknown = { repositories: {} };
    if (existsSync(dataPath)) {
      const envelope = JSON.parse(secureRead(dataPath));
      if (
        typeof envelope.payload !== "string" ||
        typeof envelope.signature !== "string" ||
        !/^[a-f0-9]{64}$/.test(envelope.signature) ||
        !timingSafeEqual(
          Buffer.from(sign(envelope.payload), "hex"),
          Buffer.from(envelope.signature, "hex")
        )
      )
        throw new Error("Invalid Governance record signature.");
      data = JSON.parse(envelope.payload);
    }
    return action(data, (next) => {
      const payload = JSON.stringify(next);
      if (Buffer.byteLength(payload) > 3 * 1024 * 1024)
        throw new Error("Governance record limit exceeded.");
      const temporary = join(root, "records.tmp");
      try {
        writeFileSync(
          temporary,
          JSON.stringify({ payload, signature: sign(payload) }),
          { mode: 0o600, flag: "wx" }
        );
        renameSync(temporary, dataPath);
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
      }
    });
  } finally {
    rmdirSync(lock);
  }
}
