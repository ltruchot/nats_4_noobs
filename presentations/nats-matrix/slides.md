---
theme: none
transition: fade
title: "NATS — Follow the white rabbit"
---

<div class="title-slide">
  <div class="matrix-rain"></div>
  <h1>N&thinsp;A&thinsp;T&thinsp;S</h1>
  <img src="/matrix-cover.gif" alt="Matrix" class="cover-img" />
  <p class="subtitle">Follow the white rabbit<span class="mq">(MQ)</span></p>
  <p class="footer">Loic Truchot — 2025</p>
</div>

---

# What is NATS? Who is it for?

A **message broker** — software that routes messages between services.

Your apps don't talk to each other directly. They talk to NATS. NATS delivers.

```
Service A ──publish──▶ NATS ──deliver──▶ Service B
                              ──deliver──▶ Service C
                              ──deliver──▶ ...
```

**Who needs this?**

- **Microservices** — decouple services, scale independently
- **IoT / Edge** — tiny footprint, runs on a Raspberry Pi (< 20 MB RAM)
- **Real-time apps** — chat, live dashboards, gaming, notifications
- **DevOps / Cloud native** — service mesh, Kubernetes sidecars, observability pipelines
- **Anyone tired of** polling APIs, managing WebSocket connections, or configuring Kafka

Not a database. Not a framework. Just an ultra-fast message router.

---

# Origin Story

**"Not Another TIBCO Server!"**

Derek Collison, driving home after implementing another **TIBCO RendezVous**: *enough bloat*.

| Year | Event |
|---|---|
| **~2010** | First NATS prototype — written in **Ruby** |
| **2012** | Rewritten in **Go** — 10x performance, single binary |
| **2014** | Open-sourced, adopted by **Cloud Foundry** (VMware) |
| **2017** | Synadia founded — Derek's company to steward NATS |
| **2018** | Accepted into **CNCF** (incubating) — alongside Kubernetes, Prometheus |
| **2020** | **JetStream** released — opt-in persistence, streams, KV |
| **2023** | NATS 2.10 — Object Store, improved clustering |
| **2025** | CNCF neutral governance — Synadia transfers trademark to Linux Foundation |

**The stack:** Go binary, ~20 MB, zero dependencies, zero config to start.

Synadia provides the commercial cloud (**Synadia Cloud / NGS**), the community runs the open-source project.

> *"The world exists now only as part of a neural-interactive simulation"* — Morpheus

Renamed: **N**eural **A**utonomic **T**ransport **S**ystem

---

# Why NATS? The messaging landscape

| | **NATS** | **Kafka** | **RabbitMQ** |
|---|---|---|---|
| **Written in** | Go | Java/Scala | Erlang |
| **Philosophy** | Simplicity-first | Distributed log | Enterprise broker |
| **Deploy** | 1 binary, zero config | JVM + KRaft (4.0+) | Erlang VM (BEAM) |
| **Latency** | < 1ms (core) | ~5ms (tunable) | ~1-5ms (varies) |
| **Persistence** | Opt-in (JetStream) | Always (append log) | Opt-in (queues) |
| **Protocol** | Text-based, simple | Binary, custom | AMQP 1.0 / STOMP |
| **Ops complexity** | Near zero | High (partitions, ISR) | Medium (exchanges, bindings) |
| **Sweet spot** | Microservices, IoT, edge | Big data pipelines | Enterprise integration |

Kafka stores everything — great for data lakes, heavy to operate.

RabbitMQ routes via exchanges/bindings — powerful, complex config.

**NATS just moves bytes.** Add persistence only when you need it.

---

# Core Concepts: Pub/Sub & Subjects

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  Publisher  │──────▶│ NATS Server │◀──────│ Subscriber  │
│  (any app)  │       │  (binary)   │       │ (any app)   │
└─────────────┘       └─────────────┘       └─────────────┘
```

- **Fire & forget** — no subscriber? Message dropped silently
- **Bytes transport** — language agnostic, you encode/decode
- **Decoupled** — publisher & subscriber don't know each other
- **Fan-out** — N subscribers all get the message

## Subject-based routing

Subjects are **dot-delimited** tokens — the broker filters, not your app:

```
orders.eu.created       # specific
orders.*.created        # * = one token  → matches orders.eu.created, orders.us.created
orders.>                # > = all tokens → matches orders.eu.created, orders.us.shipped.late
```

Dynamic **subscribe/unsubscribe** at runtime — no queue redeclaration, no topic partitioning.

---

# JetStream: When you need persistence

Same binary, one flag: `--jetstream` — opt-in persistence.

**Stream** = append-only event log on disk, captures messages by subject filter

**Consumer** = cursor into the stream — replay history, then continue live

```
Producer ──publish()──▶ NATS + JetStream ──stream──▶ disk
                                                       │
Late joiner ──────────▶ ordered consumer ◀─────────────┘
                         ├─ replay from T ──▶ catch-up
                         └─ then live ──────▶ real-time
```

| | **Core NATS** | **JetStream** |
|---|---|---|
| **Delivery** | At-most-once | At-least-once / exactly-once |
| **Late joiners** | Miss past messages | Replay from any point in time |
| **Storage** | None — pure in-flight | Disk / memory, configurable retention |
| **Use case** | Real-time events, fire & forget | Event sourcing, audit logs, replay |

Also built-in: **KV Store** (last-value cache) and **Object Store** (large blobs) — all on top of streams.
