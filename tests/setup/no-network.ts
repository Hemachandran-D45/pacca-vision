/**
 * No test may reach the network. Every Azure, OpenAI, IVR and Function App
 * call is faked, so a test run costs nothing and works offline.
 *
 * Every outbound TCP connection goes through `net.Socket.prototype.connect`:
 * global `fetch` (undici), `http`/`https` and the Azure SDKs' pipelines all
 * end up here. A connection to anything other than loopback is refused, and
 * the test that made it fails, even if its own code swallowed the error (most
 * of the server does: `catch { return null }`).
 *
 * Loopback stays open for tests that start the real Express app and fetch it.
 */
import net from "node:net";
import { afterEach, expect } from "vitest";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "::"]);
const blocked: string[] = [];

/** The connections refused since the last call, then forgets them. */
export function takeBlockedConnections(): string[] {
  return blocked.splice(0);
}

const originalConnect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function connect(this: net.Socket, ...args: unknown[]) {
  // Normalized by net: either (options, cb) or (port, host, cb) or (path, cb).
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  let host: string | undefined;
  let port: unknown;
  if (first && typeof first === "object") {
    const options = first as { host?: string; port?: unknown; path?: string };
    if (options.path) return originalConnect.apply(this, args as never);
    host = options.host;
    port = options.port;
  } else if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    port = first;
    host = typeof args[1] === "string" ? args[1] : undefined;
  } else {
    // A unix socket path.
    return originalConnect.apply(this, args as never);
  }

  if (host === undefined || LOOPBACK.has(host)) return originalConnect.apply(this, args as never);

  blocked.push(`${host}:${String(port)}`);
  process.nextTick(() => this.destroy(new Error(`no-network: blocked a connection to ${host}:${String(port)}`)));
  return this;
} as typeof net.Socket.prototype.connect;

afterEach(() => {
  const refused = takeBlockedConnections();
  expect(refused, "a test tried to reach the network; fake the call instead").toEqual([]);
});
