# PACCA Vision Demo Preparation Guide

**Prepared for:** PACCA Vision product presentation  
**Prepared by:** Manus AI  
**Demo type:** Frontend prototype with simulated authentication, authorization, data, and workflow state

## 1. Presentation objective

PACCA Vision should be presented as a **reusable intelligent document-processing operations platform** rather than as a customer-specific application. The central story is that PACCA provides a common operating layer for document intake, processing, human review, validation, and trusted final metadata. Client-specific solutions consume the final metadata through downstream automation.

The demonstration should communicate two distinct experiences. The **Central PACCA Admin Portal** provides platform-level visibility across clients. The **Client Workspace** provides the operational and configuration experience for one authorized client environment. For this demo, Client 1 is the active authorized workspace and is intentionally shown as fixed context rather than as a tenant selector.

## 2. Demo environment and entry points

| Item | Demo behavior |
| --- | --- |
| Application | PACCA Vision — Intelligent Document Platform |
| Active workspace | Client 1 |
| Environment | Production |
| Authentication | Mock authentication; no credentials are transmitted |
| Authorization | Simulated role-based access control |
| Persistence | Local frontend state only; refresh resets temporary edits |
| Primary client solution | Invoice Processing |
| Demo documents | DOC-001, DOC-002, DOC-003 |
| Temporarily hidden | Deployment Wizard and Infrastructure from the main navigation |

Open the application through the current website checkpoint: [Open website](manus-webdev://8e46c837).

## 3. Recommended presentation sequence

The most effective sequence is to begin with the platform concept, enter the client workspace, demonstrate the invoice lifecycle, resolve a HIL exception, inspect the logical pipeline, and finish with the reusable configuration model. The Central Admin Portal can be shown either before the client journey or as a short closing explanation of the multi-client model.

| Sequence | Screen | Demonstration purpose |
| --- | --- | --- |
| 1 | Login | Establish the separation between Central Admin and Client Workspace |
| 2 | Central Admin Portal | Show clients, platform health, and the Client 1 handoff |
| 3 | Command Center | Explain the operational overview and invoice workload |
| 4 | Documents | Show the three representative documents and their lifecycle states |
| 5 | DOC-001 Details | Show completed final metadata and processing history |
| 6 | DOC-002 HIL Review | Demonstrate review, correction, audit summary, and approval |
| 7 | Pipeline Monitor | Explain stage status, latency, failures, retries, and active processing |
| 8 | Pipeline Studio | Show the logical pipeline and attached Intake/Deliver connectors |
| 9 | Metadata Studio | Show the invoice schema and version history |
| 10 | Solutions | Show Invoice Processing, Referral Creation, and Payment Posting |
| 11 | Rules & Validations | Explain confidence thresholds and validation controls |

## 4. Login and access model

The login screen communicates two conceptual paths without implying that every user can freely select any tenant.

### 4.1 Client Workspace

Select **Client Workspace**. The screen displays **Authorized workspace — Client 1** as a fixed context. The user does not choose an arbitrary tenant. Select a demo persona if a different role is needed, then continue to the workspace.

Available client personas are:

| Persona | Intended demonstration |
| --- | --- |
| Nadia Okafor | Operations User; document monitoring and operational work |
| Aisha Rahman | HIL Reviewer; human review and correction workflow |
| Suresh Kiran | Administrator; broader client configuration access |
| Maya Chen | Solution/Implementation Team; solution and pipeline configuration |

### 4.2 Central Admin

Select **Central Admin** to enter the PACCA platform administration experience. The scope is **PACCA Platform**, not Client 1. The portal shows a lightweight directory of Client 1, Client 2, and Client 3. Select **Client 1 → View overview** to demonstrate the controlled handoff into the Client 1 Workspace.

The Central Admin experience is intentionally lightweight. It communicates the multi-client platform model without introducing a second complex product.

## 5. Central PACCA Admin Portal

The Central Admin Portal represents platform-level administration. Its purpose is to answer, “What is the health and status of the PACCA platform and its client workspaces?”

| Area | What to show |
| --- | --- |
| Clients | Client 1 active, Client 2 active, Client 3 provisioning |
| Active deployments | Representative platform count |
| Platform health | Healthy status for representative services |
| Access posture | Platform-level administrative controls enforced |
| Platform overview | Client workspaces, representative regions, and last platform check |
| Handoff | Client 1 View overview opens the authorized client workspace |

**Talk track:** “PACCA is the common control plane. Client workspaces remain separated, while platform administrators retain a platform-level view and can enter an authorized client workspace for demonstration or support.”

## 6. Client Workspace shell

The Client Workspace is the primary operational experience. The shell keeps context visible across routes.

The left navigation contains the following active demo areas:

| Group | Active features |
| --- | --- |
| Operate | Command Center, Documents, HIL Review, Pipeline Monitor, Analytics & Cost |
| Configure | Solutions, Pipeline Studio, Metadata Studio, Rules & Validations |
| Administration | Settings |

The shell visibly shows **Workspace → Client 1 → Authorized** and the top context bar shows **Client 1 / Client Workspace / Production**. Deployment Wizard and Infrastructure are temporarily hidden from the main demo navigation, but their existing implementations and routes remain preserved for later re-enablement.

## 7. Command Center

Command Center is the operational starting point. It presents a representative snapshot of the Client 1 Invoice Processing workload.

| Component | Demo content |
| --- | --- |
| Metric cards | Documents Processed, Pending HIL Review, Avg. Confidence, Avg. Processing Time, Success Rate |
| Live processing pipeline | Ingest, Preprocess, Understand, Extract, Validate, HIL Review, Deliver |
| HIL queue | invoice_002.pdf with low-confidence Total Amount exception |
| Processing trend | Processed versus HIL Required over a representative window |
| Documents by type | Three demo invoice documents |
| Cost overview | Representative processing cost by service/model category |
| Recent documents | DOC-001, DOC-002, and DOC-003 with distinct lifecycle states |

The values are representative static demo data. They should be described as a visual operating snapshot, not as live production telemetry.

**Talk track:** “The Command Center gives an operations team one place to understand throughput, confidence, HIL demand, processing time, and the documents requiring attention.”

## 8. Documents

The Documents screen is the investigation index for the Client 1 workspace. It shows the three invoice records used throughout the demo.

| Document | Status | Demonstration role |
| --- | --- | --- |
| DOC-001 / invoice_001.pdf | Processed | Completed document with final metadata |
| DOC-002 / invoice_002.pdf | Needs Review | HIL exception caused by low-confidence Total Amount |
| DOC-003 / invoice_003.pdf | Processing | In-progress document with stage-specific timeline |

Use the search field to demonstrate document lookup. Open a document to move from inventory into operational investigation.

## 9. Document Details

Document Details provides a document-level view of extracted invoice metadata, processing state, and logical timeline.

The invoice metadata schema includes:

| Field | Example value | Review meaning |
| --- | --- | --- |
| Invoice Number | INV-2026-001 / INV-2026-002 | Required invoice identifier |
| Invoice Date | 29-Aug-2026 | Required source date |
| Vendor Name | Global Office Supplies | Required business party |
| Purchase Order | PO-45822 | Optional or conditional reference |
| Subtotal | ₹42,000 | Required monetary component |
| Tax Amount | ₹7,560 | Required monetary component |
| Total Amount | ₹49,560 | Required; flagged for DOC-002 |
| Currency | INR | Required monetary context |
| Due Date | 28-Sep-2026 | Optional or conditional payment date |

For DOC-001, emphasize that processed final metadata is presented as the trusted output. For DOC-002, use the HIL route because the document requires human correction. For DOC-003, show the timeline states: completed, in progress, waiting, and not applicable where relevant.

## 10. HIL Review workbench

HIL means **human-in-the-loop**. The HIL workbench is a split-screen review surface for documents that cannot safely proceed through automation alone.

The left side shows the source document. The right side shows the review decision, the low-confidence exception, and editable extracted metadata.

### 10.1 HIL exception story

DOC-002 is the primary review case. Its Total Amount is low confidence. The user should explain that document clarity or extraction ambiguity can affect more than one value, so the reviewer is allowed to correct the complete extracted metadata set before approval.

All nine extracted fields are editable in HIL Review:

1. Invoice Number
2. Invoice Date
3. Vendor Name
4. Purchase Order
5. Subtotal
6. Tax Amount
7. Total Amount
8. Currency
9. Due Date

The Total Amount remains visually flagged because it is the reason the document entered HIL. The other fields are editable because a reviewer may identify additional extraction errors while examining the source.

### 10.2 Reviewer change audit summary

To demonstrate the new audit summary:

1. Open **HIL Review** and select DOC-002.
2. Change a field such as Vendor Name or Total Amount.
3. Observe the **Reviewer change summary** panel.
4. Show the changed count.
5. Show each changed field with its original value and revised value.
6. Click **Save changes**.
7. Explain that the correction is now represented in the review draft before approval.
8. Click **Approve & deliver** only after explaining that this is a simulated demo action.

The audit summary is intentionally visible before approval so the reviewer can confirm exactly what will be written into the final metadata contract.

## 11. Pipeline Monitor

Pipeline Monitor describes the document-processing workload using logical stages rather than infrastructure components.

The logical pipeline is:

> Document Intake → Preprocess → Understand / Classify → Extract → Validate → HIL (conditional) → Deliver

The screen shows stage status, processing count, failures, latency, retries, SLA compliance, and currently processing documents. The HIL stage is conditional. Connectors are not stages.

**Talk track:** “The monitor is organized around the document lifecycle. Infrastructure details remain behind the platform contract, so operators can understand workload and exceptions without needing to interpret cloud-specific implementation details.”

## 12. Pipeline Studio

Pipeline Studio composes the Client 1 Invoice Processing Pipeline. It keeps logical processing stages separate from configuration attached to those stages.

### 12.1 Intake configuration

Select **Document Intake**. The attached configuration displays:

| Field | Demo value |
| --- | --- |
| Input connector | Amazon S3 |
| Integration | Client 1 — Invoice Intake |
| Bucket | client-1-invoices |
| Path | /incoming/ |

The fields are editable. Change a value to show the button changing from **Saved** to **Save connector changes**. Save the change to show the success toast and return to the **Saved** state.

### 12.2 Deliver configuration

Select **Deliver**. The attached configuration displays:

| Field | Demo value |
| --- | --- |
| Output connector | Amazon S3 |
| Integration | Client 1 — Invoice Output |
| Bucket | client-1-output |
| Path | /processed/ |

The same editable and saved-state behavior applies. Emphasize that Amazon S3 is configuration attached to Intake or Deliver. It is not a separate logical pipeline stage.

## 13. Metadata Studio

Metadata Studio defines the final metadata contract consumed by downstream automation. The Invoice Metadata Schema contains the nine invoice fields listed in the Document Details section.

The version-history panel demonstrates that schema changes can be tracked over time. Use it to explain that a schema is not an invisible implementation detail. It is a governed contract with version, author, timestamp, change summary, and restore-selection behavior.

**Talk track:** “PACCA’s reusable engine produces trusted final metadata. Each client solution can define the schema required by its downstream processes without changing the common platform.”

## 14. Solutions

The Solutions library presents reusable business and document-processing use cases. Every solution consumes PACCA’s final metadata.

| Solution | Demonstration message |
| --- | --- |
| Invoice Processing | Extract, validate, and route invoice metadata |
| Referral Creation | Classify referral documents and route complete referral packets |
| Payment Posting | Validate remittance details and deliver posting-ready metadata |

Invoice Processing is the fully demonstrated Client 1 solution. Referral Creation and Payment Posting communicate how the same PACCA platform can support different business requirements without hard-coding a single customer workflow.

## 15. Rules & Validations

Rules & Validations explains how the workspace governs extracted metadata before delivery. Use this screen to discuss required fields, confidence thresholds, validation checks, and exception routing.

The important product relationship is:

> Low confidence or failed validation can route a document to HIL; a reviewer correction produces final metadata that can be delivered downstream.

## 16. Analytics & Cost

Analytics & Cost provides a representative operating view of throughput, automation, HIL rate, confidence, processing time, failures, and estimated cost. Cost is categorized by representative service/model areas rather than presented as a live billing integration.

Use the screen to connect operational outcomes to business value: more automation, fewer manual reviews, predictable processing time, and transparent cost drivers.

## 17. Administration and temporary demo scope

Settings remains available in the client workspace for workspace preferences and policy controls. Deployment Wizard and Infrastructure are intentionally hidden from the main navigation for the current presentation. They have not been deleted, and their routes and implementations remain preserved.

The current demo should not spend time on infrastructure provisioning. The intended presentation focus is the product journey from document intake to trusted final metadata.

## 18. Loading, empty, error, and success states

The prototype includes simulated loading transitions and skeleton screens to communicate that the real product would fetch data from APIs.

| State | Where to demonstrate it |
| --- | --- |
| Loading | Navigate between workspace routes and observe the skeleton transition |
| Empty | Use a filtered or unavailable operational area where the empty-state treatment appears |
| Error / access denied | Sign in as a restricted persona and attempt a non-permitted route |
| Success | Save HIL changes, save connector changes, or approve a HIL document |
| Permission boundary | Compare Operations User navigation with Administrator navigation |

These states are frontend simulations. They are not evidence of backend persistence or production authorization enforcement.

## 19. Role-based demonstration plan

| Role | Best route | Expected emphasis |
| --- | --- | --- |
| Operations User | Command Center, Documents, Monitor | Tracking workload and investigating document status |
| HIL Reviewer | HIL Review, Document Details | Correcting extracted metadata and reviewing audit changes |
| Administrator | Settings, Metadata Studio, Rules | Governing schemas, policies, and validation behavior |
| Solution/Implementation Team | Solutions, Pipeline Studio | Reusable solutions, logical stages, and connector configuration |
| PACCA Platform Administrator | Central Admin Portal | Client directory, platform health, and workspace handoff |

## 20. Suggested 10-minute talk track

Begin by stating that PACCA Vision is a common, cloud-agnostic document operations layer. Spend one minute on the login distinction between Central Admin and Client Workspace. Spend one minute showing the Central Admin client directory and opening Client 1.

Spend two minutes on Command Center and Documents. Explain that DOC-001 is complete, DOC-002 requires human review, and DOC-003 is still processing. Spend two minutes on HIL Review. Edit at least two fields, show the reviewer change summary, save the draft, and explain that only the low-confidence Total Amount caused the HIL route even though all extracted fields are available for correction.

Spend two minutes on Pipeline Monitor and Pipeline Studio. Explain the seven logical stages and show that Intake and Deliver connectors are attached configuration, not pipeline stages. Spend one minute on Metadata Studio and version history. Finish with Solutions and the three reusable patterns.

Close by reinforcing that Client 1 is one configured workspace on a common PACCA platform. Client 2 and Client 3 are represented conceptually in Central Admin, while their full configurations are intentionally outside this demo scope.

## 21. Demo safety notes

The application is a static frontend prototype. Do not describe the displayed values as live production data. Do not claim that edits persist after refresh. Do not claim that authentication, tenant isolation, or authorization is enforced by a backend. Describe those capabilities as simulated UI behavior for the presentation.

Avoid opening Deployment Wizard or Infrastructure during the current presentation because those areas are intentionally hidden from the main navigation. Avoid presenting Client 2 or Client 3 as fully implemented workspaces. They are included to communicate the multi-client platform concept.

## 22. Final presentation checklist

| Check | Ready |
| --- | --- |
| Login clearly separates Central Admin and Client Workspace | Yes |
| Client 1 appears as fixed authorized context | Yes |
| Central Admin can open Client 1 workspace | Yes |
| Command Center uses coherent invoice demo data | Yes |
| Documents show DOC-001, DOC-002, and DOC-003 | Yes |
| DOC-002 enters HIL because of low-confidence Total Amount | Yes |
| All nine HIL invoice fields are editable | Yes |
| Reviewer change audit summary is visible | Yes |
| HIL Save Changes feedback is visible | Yes |
| Pipeline Monitor uses logical stages | Yes |
| Intake and Deliver connectors are attached configuration | Yes |
| Intake and Deliver connector fields are editable | Yes |
| Metadata Studio shows schema version history | Yes |
| Solutions show Invoice Processing, Referral Creation, Payment Posting | Yes |
| Deployment Wizard and Infrastructure are hidden from main navigation | Yes |
| Loading and transition behavior is available | Yes |
| TypeScript and production build pass | Yes |
| Browser console is clean after tested flows | Yes |

## 23. References

This guide is based on the supplied PACCA Vision Product Document and the implemented frontend QA record.

[1]: file:///home/ubuntu/upload/PACCA_Vision_Final_Product_Document(1).docx "PACCA Vision Final Product Document"
[2]: file:///home/ubuntu/pacca-vision/QA_REPORT.md "PACCA Vision Frontend QA Report"
