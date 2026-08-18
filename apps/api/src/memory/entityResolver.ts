export type ResolvedActor = {
  displayName: string;
  canonicalKey: string;
};

/** Resolves request-level names while the extractor treats "I" as that actor. */
export class EntityResolver {
  resolveActor(input: string): ResolvedActor {
    const displayName = input.normalize("NFKC").trim().replace(/\s+/g, " ");
    const canonicalKey = displayName
      .toLocaleLowerCase()
      .replace(/^@/, "")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ");

    return { displayName, canonicalKey };
  }
}
