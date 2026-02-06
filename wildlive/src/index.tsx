import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/web";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Observation } from "../../types/observation";
import { Home } from "./views/Home";
import { connect, StringCodec } from "nats";

// --- SSE subscribers ---

const subscribers = new Set<ServerSentEventGenerator>();

// --- Broadcast (transport-agnostic) ---

function broadcast({ id, ...place }: Observation) {
  for (const stream of subscribers) {
    try {
      stream.patchSignals(JSON.stringify({ _places: { [id]: place } }));
    } catch {
      subscribers.delete(stream);
    }
  }
}

// --- Data source: HTTP poll (lvl0) ---
const nc = await connect({ servers: "localhost:4222" });
const sc = StringCodec();

async function receiveObservations() {
  console.log(`[wildlive] polling ${Bun.env.WATCHER_URL} every 1s`);

  console.log(`[wildlive] connected to NATS at ${nc.getServer()}`);
  for await (const msg of nc.subscribe("nature.observation")) {
    const obs = JSON.parse(sc.decode(msg.data)) as Observation;
    broadcast(obs);
  }
}

receiveObservations();

// --- Hono routes ---

const app = new Hono();

app.get("/", (c) => c.html(<Home />));

app.get("/sse", () => {
  let currentStream: ServerSentEventGenerator | undefined;

  return ServerSentEventGenerator.stream(
    (stream) => {
      currentStream = stream;
      subscribers.add(currentStream);
    },
    {
      keepalive: true,
      onAbort: () => {
        if (currentStream) subscribers.delete(currentStream);
      },
      onError: () => {
        if (currentStream) subscribers.delete(currentStream);
      },
    },
  );
});

app.use("/*", serveStatic({ root: "./static" }));

export { app };

export default {
  port: Number(Bun.env.PORT),
  fetch: app.fetch,
  idleTimeout: 0,
};
