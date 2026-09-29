# SRE Observability & Copilot Chat Engine

## Overview
This feature introduces real-time pipeline observability, KQL distributed trace diagnostics, and the autonomous AI SRE Copilot to PACCA Vision.

## Key Capabilities
1. **Observability Copilot Chat (`server/senderra/observabilityChat.ts`)**:
   - Multi-turn autonomous agent for distributed telemetry correlation.
   - Dynamic KQL generation for Azure Log Analytics and Azure Cosmos DB telemetry.
   - Autonomous tool-calling badges and root-cause hypothesis scoring.
2. **KQL Explorer Console (`client/src/pages/observability/ObservabilityPage.tsx`)**:
   - Interactive KQL query execution on `traces`, `dependencies`, and `exceptions` telemetry tables.
   - Preset diagnostic queries for slow requests, 429 quota throttles, GenAI tool dropouts, and queue spikes.
3. **Pipeline Gap Detection & Reconciliation**:
   - Auto-reconciliation between Azure Blob storage (`docs-in`) and Azure Cosmos DB records.
   - Identification of silent Event Grid drops, OCR stalls, and dead-letter queue (DLQ) anomalies.
4. **Full-Width Dashboard Layout**:
   - Seamless edge-to-edge spatial alignment matching the Operations Dashboard.
