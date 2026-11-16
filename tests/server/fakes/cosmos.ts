/**
 * An in-memory stand-in for `@azure/cosmos`, so route tests run the real
 * `server/senderra/cosmos.ts` (queries, folding, review writes) with no
 * account and no cost.
 *
 * Wire it in a test file with:
 *
 *   vi.mock("@azure/cosmos", async () => (await import("./fakes/cosmos.js")).fakeCosmosModule());
 *
 * then seed and inspect containers through `fakeCosmos`.
 *
 * Queries are evaluated, not pattern-matched: the fake understands the subset
 * of Cosmos SQL the server uses (SELECT * / VALUE COUNT(1) / a column list,
 * WHERE with = != AND OR and parentheses, @parameters, ORDER BY one path). A
 * query outside that subset throws, so a new query shape is noticed instead
 * of silently returning nothing.
 */

type Item = Record<string, any>;
type Param = { name: string; value: unknown };
type QuerySpec = string | { query: string; parameters?: Param[] };

export class CosmosError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message);
  }
}

// --- a small Cosmos SQL evaluator -----------------------------------------------

type Token = { kind: "word" | "path" | "string" | "number" | "param" | "op" | "punct"; text: string };

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const re = /\s*(?:(c(?:\.[A-Za-z_][A-Za-z0-9_]*)+)|('(?:[^']|'')*')|(@[A-Za-z_][A-Za-z0-9_]*)|(-?\d+(?:\.\d+)?)|(!=|<>|>=|<=|=|<|>)|([(),*])|([A-Za-z_][A-Za-z0-9_]*))/y;
  let pos = 0;
  while (pos < sql.length) {
    if (/^\s*$/.test(sql.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(sql);
    if (!m) throw new Error(`fake cosmos: cannot parse query near "${sql.slice(pos)}"`);
    pos = re.lastIndex;
    if (m[1]) tokens.push({ kind: "path", text: m[1] });
    else if (m[2]) tokens.push({ kind: "string", text: m[2].slice(1, -1).replace(/''/g, "'") });
    else if (m[3]) tokens.push({ kind: "param", text: m[3] });
    else if (m[4]) tokens.push({ kind: "number", text: m[4] });
    else if (m[5]) tokens.push({ kind: "op", text: m[5] });
    else if (m[6]) tokens.push({ kind: "punct", text: m[6] });
    else tokens.push({ kind: "word", text: m[7] });
  }
  return tokens;
}

function readPath(item: Item, path: string): unknown {
  return path
    .split(".")
    .slice(1)
    .reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Item)[key] : undefined), item);
}

type Predicate = (item: Item) => boolean;

type ParsedQuery = {
  select: { kind: "all" } | { kind: "count" } | { kind: "columns"; paths: string[] };
  where: Predicate;
  orderBy: { path: string; desc: boolean } | null;
};

function parseQuery(sql: string, params: Param[]): ParsedQuery {
  const tokens = tokenize(sql);
  let i = 0;
  const peek = () => tokens[i];
  const isWord = (t: Token | undefined, word: string) => t?.kind === "word" && t.text.toUpperCase() === word;
  const expectWord = (word: string) => {
    if (!isWord(tokens[i], word)) throw new Error(`fake cosmos: expected ${word} in "${sql}"`);
    i += 1;
  };
  const paramValue = (name: string) => {
    const found = params.find((p) => p.name === name);
    if (!found) throw new Error(`fake cosmos: no value for ${name}`);
    return found.value;
  };

  expectWord("SELECT");
  let select: ParsedQuery["select"];
  if (peek()?.kind === "punct" && peek().text === "*") {
    i += 1;
    select = { kind: "all" };
  } else if (isWord(peek(), "VALUE")) {
    i += 1;
    const fn = tokens.slice(i, i + 4).map((t) => t.text.toUpperCase()).join("");
    if (fn !== "COUNT(1)") throw new Error(`fake cosmos: only VALUE COUNT(1) is supported, in "${sql}"`);
    i += 4;
    select = { kind: "count" };
  } else {
    const paths: string[] = [];
    while (peek()?.kind === "path") {
      paths.push(tokens[i].text);
      i += 1;
      if (peek()?.text === ",") i += 1;
    }
    if (paths.length === 0) throw new Error(`fake cosmos: unsupported SELECT in "${sql}"`);
    select = { kind: "columns", paths };
  }

  expectWord("FROM");
  expectWord("C");

  const operand = (): ((item: Item) => unknown) => {
    const t = tokens[i];
    i += 1;
    if (!t) throw new Error(`fake cosmos: unexpected end of "${sql}"`);
    if (t.kind === "path") return (item) => readPath(item, t.text);
    if (t.kind === "string") return () => t.text;
    if (t.kind === "number") return () => Number(t.text);
    if (t.kind === "param") {
      const value = paramValue(t.text);
      return () => value;
    }
    if (isWord(t, "TRUE")) return () => true;
    if (isWord(t, "FALSE")) return () => false;
    if (isWord(t, "NULL")) return () => null;
    throw new Error(`fake cosmos: unsupported operand "${t.text}" in "${sql}"`);
  };

  const comparison = (): Predicate => {
    if (peek()?.text === "(") {
      i += 1;
      const inner = orExpr();
      if (tokens[i]?.text !== ")") throw new Error(`fake cosmos: missing ) in "${sql}"`);
      i += 1;
      return inner;
    }
    const left = operand();
    const op = tokens[i];
    if (op?.kind !== "op") throw new Error(`fake cosmos: expected a comparison in "${sql}"`);
    i += 1;
    const right = operand();
    switch (op.text) {
      case "=":
        return (item) => left(item) !== undefined && left(item) === right(item);
      case "!=":
      case "<>":
        return (item) => left(item) !== undefined && right(item) !== undefined && left(item) !== right(item);
      default:
        throw new Error(`fake cosmos: operator ${op.text} is not supported`);
    }
  };

  const andExpr = (): Predicate => {
    let pred = comparison();
    while (isWord(peek(), "AND")) {
      i += 1;
      const left = pred;
      const right = comparison();
      pred = (item) => left(item) && right(item);
    }
    return pred;
  };

  function orExpr(): Predicate {
    let pred = andExpr();
    while (isWord(peek(), "OR")) {
      i += 1;
      const left = pred;
      const right = andExpr();
      pred = (item) => left(item) || right(item);
    }
    return pred;
  }

  let where: Predicate = () => true;
  if (isWord(peek(), "WHERE")) {
    i += 1;
    where = orExpr();
  }

  let orderBy: ParsedQuery["orderBy"] = null;
  if (isWord(peek(), "ORDER")) {
    i += 1;
    expectWord("BY");
    const path = tokens[i];
    if (path?.kind !== "path") throw new Error(`fake cosmos: ORDER BY needs a path in "${sql}"`);
    i += 1;
    let desc = false;
    if (isWord(peek(), "DESC") || isWord(peek(), "ASC")) {
      desc = isWord(peek(), "DESC");
      i += 1;
    }
    orderBy = { path: path.text, desc };
  }

  if (i !== tokens.length) throw new Error(`fake cosmos: unsupported clause "${tokens[i].text}" in "${sql}"`);
  return { select, where, orderBy };
}

// --- containers ----------------------------------------------------------------

const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

export type CosmosCall =
  | { op: "query"; query: string; parameters: Param[]; partitionKey?: unknown }
  | { op: "read"; id: string; partitionKey: unknown }
  | { op: "upsert"; item: Item; ifMatch?: string }
  | { op: "patch"; id: string; partitionKey: unknown; operations: unknown[]; ifMatch?: string };

export class FakeContainer {
  private store = new Map<string, Item>();
  private failures: { op: CosmosCall["op"]; error: Error; skip: number }[] = [];
  private etagCounter = 0;
  readonly calls: CosmosCall[] = [];

  constructor(
    readonly name: string,
    private readonly partitionKeyPath: string
  ) {}

  private pkOf(item: Item): unknown {
    return readPath(item, `c${this.partitionKeyPath.replace(/\//g, ".")}`);
  }

  private key(id: string, pk: unknown) {
    return `${JSON.stringify(pk)}\u0000${id}`;
  }

  private stamp(item: Item): Item {
    this.etagCounter += 1;
    return { ...clone(item), _etag: `"etag-${this.etagCounter}"`, _ts: Math.floor(Date.now() / 1000) };
  }

  private maybeFail(op: CosmosCall["op"]) {
    const idx = this.failures.findIndex((f) => f.op === op);
    if (idx < 0) return;
    const failure = this.failures[idx];
    if (failure.skip > 0) {
      failure.skip -= 1;
      return;
    }
    this.failures.splice(idx, 1);
    throw failure.error;
  }

  /** Put items in place, as the pipeline would have written them. */
  seed(...items: Item[]) {
    for (const item of items) this.store.set(this.key(item.id, this.pkOf(item)), this.stamp(item));
  }

  /** One stored item, or undefined. */
  get(id: string, pk: unknown): Item | undefined {
    return clone(this.store.get(this.key(id, pk)));
  }

  all(): Item[] {
    return [...this.store.values()].map(clone);
  }

  /** Make the next call of this kind throw, or the one after `skip` more succeed. */
  failNext(
    op: CosmosCall["op"],
    error: Error = new CosmosError(503, `fake cosmos: injected ${op} failure`),
    { skip = 0 }: { skip?: number } = {}
  ) {
    this.failures.push({ op, error, skip });
  }

  reset() {
    this.store.clear();
    this.failures = [];
    this.calls.length = 0;
    this.etagCounter = 0;
  }

  items = {
    query: (spec: QuerySpec, options: { partitionKey?: unknown } = {}) => {
      const query = typeof spec === "string" ? spec : spec.query;
      const parameters = typeof spec === "string" ? [] : (spec.parameters ?? []);
      return {
        fetchAll: async () => {
          this.calls.push({ op: "query", query, parameters, partitionKey: options.partitionKey });
          this.maybeFail("query");
          const parsed = parseQuery(query, parameters);
          let rows = [...this.store.values()].filter(
            (item) => options.partitionKey === undefined || this.pkOf(item) === options.partitionKey
          );
          rows = rows.filter(parsed.where);
          if (parsed.orderBy) {
            const { path, desc } = parsed.orderBy;
            rows.sort((a, b) => {
              const x = readPath(a, path) as any;
              const y = readPath(b, path) as any;
              const cmp = x === y ? 0 : x === undefined ? -1 : y === undefined ? 1 : x < y ? -1 : 1;
              return desc ? -cmp : cmp;
            });
          }
          let resources: unknown[];
          if (parsed.select.kind === "count") resources = [rows.length];
          else if (parsed.select.kind === "columns") {
            const paths = parsed.select.paths;
            resources = rows.map((row) =>
              Object.fromEntries(
                paths
                  .map((p) => [p.split(".").pop()!, readPath(row, p)] as const)
                  .filter(([, value]) => value !== undefined)
              )
            );
          } else resources = rows.map(clone);
          return { resources };
        },
      };
    },
    upsert: async (item: Item, options?: { accessCondition?: { type: string; condition: string } }) => {
      const ifMatch = options?.accessCondition?.type === "IfMatch" ? options.accessCondition.condition : undefined;
      this.calls.push({ op: "upsert", item: clone(item), ifMatch });
      this.maybeFail("upsert");
      const k = this.key(item.id, this.pkOf(item));
      if (ifMatch && this.store.get(k)?._etag !== ifMatch) {
        throw new CosmosError(412, "fake cosmos: precondition failed");
      }
      const stored = this.stamp(item);
      this.store.set(k, stored);
      return { resource: clone(stored), statusCode: 200 };
    },
  };

  item(id: string, partitionKey: unknown) {
    return {
      read: async () => {
        this.calls.push({ op: "read", id, partitionKey });
        this.maybeFail("read");
        const found = this.store.get(this.key(id, partitionKey));
        // Like the SDK: a missing item is a 404 status, not a throw.
        return { resource: clone(found), statusCode: found ? 200 : 404 };
      },
      patch: async (
        operations: { op: string; path: string; value?: unknown }[],
        options?: { accessCondition?: { type: string; condition: string } }
      ) => {
        const ifMatch = options?.accessCondition?.type === "IfMatch" ? options.accessCondition.condition : undefined;
        this.calls.push({ op: "patch", id, partitionKey, operations: clone(operations), ifMatch });
        this.maybeFail("patch");
        const k = this.key(id, partitionKey);
        const found = this.store.get(k);
        if (!found) throw new CosmosError(404, `fake cosmos: no item ${id}`);
        if (ifMatch && found._etag !== ifMatch) throw new CosmosError(412, "fake cosmos: precondition failed");
        const next = clone(found);
        for (const operation of operations) {
          if (operation.op !== "set" && operation.op !== "add" && operation.op !== "replace") {
            throw new Error(`fake cosmos: patch op ${operation.op} is not supported`);
          }
          const parts = operation.path.split("/").slice(1);
          let target = next;
          for (const part of parts.slice(0, -1)) target = target[part] ??= {};
          target[parts[parts.length - 1]] = clone(operation.value);
        }
        const stored = this.stamp(next);
        this.store.set(k, stored);
        return { resource: clone(stored), statusCode: 200 };
      },
    };
  }
}

/** Partition key per container, as the real ones are created (`solutions`: scripts/seed-solutions.ts). */
const PARTITION_KEYS: Record<string, string> = { users: "/username", solutions: "/typeKey" };

/** Containers by name. The server opens `documents`, `users` and `solutions`. */
class FakeCosmosAccount {
  private containers = new Map<string, FakeContainer>();
  readonly clients: { endpoint: string; key: string }[] = [];

  container(name: string): FakeContainer {
    let found = this.containers.get(name);
    if (!found) {
      found = new FakeContainer(name, PARTITION_KEYS[name] ?? "/documentId");
      this.containers.set(name, found);
    }
    return found;
  }

  /** Empty every container. The instances stay, because `cosmos.ts` caches its handle. */
  reset() {
    for (const c of this.containers.values()) c.reset();
  }
}

export const fakeCosmos = new FakeCosmosAccount();

/** The module object `vi.mock("@azure/cosmos", ...)` should return. */
export function fakeCosmosModule() {
  class CosmosClient {
    constructor(options: { endpoint: string; key: string }) {
      fakeCosmos.clients.push({ endpoint: options.endpoint, key: options.key });
    }
    database(_name: string) {
      return { container: (name: string) => fakeCosmos.container(name) };
    }
  }
  return { CosmosClient };
}
