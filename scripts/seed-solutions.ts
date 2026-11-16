import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "../server/loadLocalEnv.js";
import { solutionsContainer } from "../server/senderra/cosmos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export type CatalogField = {
  name: string;
  type: string;
  required: boolean;
  class?: string;
  description?: string;
  criticality?: string | null;
  validation_mode?: string | null;
  validators?: string[];
  aliases?: string[];
  enum?: string[] | null;
};

export type SolutionDocument = {
  id: string;
  typeKey: string;
  name: string;
  department: string;
  guidance: string;
  fields: CatalogField[];
  compiledSchema?: Record<string, unknown> | null;
  compiledPrompt?: string | null;
  fieldMeta?: Record<string, unknown> | null;
  classificationEntry?: {
    categoryDescription: string;
    signals: string[];
  } | null;
  compiledAt: string | null;
  version: number;
};

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function defaultDepartmentForType(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("prescription") || k.includes("rx") || k.includes("pharmacy") || k.includes("pbm")) {
    return "Pharmacy Operations";
  }
  if (k.includes("auth") || k.includes("pa") || k.includes("approval")) {
    return "Prior Authorization";
  }
  if (k.includes("appeal") || k.includes("denial")) {
    return "Appeals & Compliance";
  }
  if (k.includes("invoice") || k.includes("claim") || k.includes("insurance") || k.includes("bill") || k.includes("cms") || k.includes("ub04") || k.includes("explanation") || k.includes("eob")) {
    return "Billing & Claims";
  }
  if (k.includes("demographic") || k.includes("intake") || k.includes("enroll") || k.includes("referral")) {
    return "Patient Intake";
  }
  if (k.includes("chart") || k.includes("necessity") || k.includes("clinical") || k.includes("encounter") || k.includes("note") || k.includes("lab")) {
    return "Clinical Operations";
  }
  return "General Operations";
}

export function buildExistingSolutions(): SolutionDocument[] {
  const outDir = path.join(rootDir, "analyzers", "out");
  const fieldMetaPath = path.join(outDir, "field_meta.json");
  const guidancePath = path.join(outDir, "pacca_guidance.json");

  if (!fs.existsSync(fieldMetaPath)) {
    throw new Error(`field_meta.json not found at ${fieldMetaPath}`);
  }

  const fieldMeta = JSON.parse(fs.readFileSync(fieldMetaPath, "utf8")) as Record<string, Record<string, any>>;
  let guidance: Record<string, { guidance: string; department?: string }> = {};
  if (fs.existsSync(guidancePath)) {
    try {
      guidance = JSON.parse(fs.readFileSync(guidancePath, "utf8"));
    } catch {
      guidance = {};
    }
  }

  const solutions: SolutionDocument[] = [];
  const now = new Date().toISOString();

  for (const [typeKey, fieldsObj] of Object.entries(fieldMeta)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(typeKey)) continue;

    const fields: CatalogField[] = [];
    for (const [fieldName, fieldData] of Object.entries(fieldsObj)) {
      if (fieldName.startsWith("_")) continue;
      fields.push({
        name: fieldName,
        type: typeof fieldData.type === "string" ? fieldData.type : "string",
        required: Boolean(fieldData.required),
        class: typeof fieldData.class === "string" ? fieldData.class : "A",
        description: typeof fieldData.description === "string" ? fieldData.description : undefined,
        criticality: fieldData.criticality || null,
        validation_mode: fieldData.validation_mode || null,
        validators: fieldData.validators || [],
        aliases: fieldData.aliases || [],
        enum: fieldData.enum || null,
      });
    }

    // Check for compiled schema and prompt
    const schemaFile = path.join(outDir, "schemas", `${typeKey}.json`);
    const promptFile = path.join(outDir, "prompts", `${typeKey}.txt`);

    let compiledSchema: Record<string, unknown> | null = null;
    let compiledPrompt: string | null = null;

    if (fs.existsSync(schemaFile)) {
      try {
        compiledSchema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
      } catch {
        compiledSchema = null;
      }
    }

    if (fs.existsSync(promptFile)) {
      try {
        compiledPrompt = fs.readFileSync(promptFile, "utf8");
      } catch {
        compiledPrompt = null;
      }
    }

    solutions.push({
      id: typeKey,
      typeKey,
      name: humanizeKey(typeKey),
      department: guidance[typeKey]?.department || defaultDepartmentForType(typeKey),
      guidance: guidance[typeKey]?.guidance || "",
      fields,
      compiledSchema,
      compiledPrompt,
      fieldMeta: fieldsObj,
      classificationEntry: {
        categoryDescription: guidance[typeKey]?.guidance || `Extracts fields from ${humanizeKey(typeKey)}.`,
        signals: fields.slice(0, 5).map((f) => `"${humanizeKey(f.name)}" label or block`),
      },
      compiledAt: now,
      version: 1,
    });
  }

  return solutions;
}

async function main() {
  loadLocalEnv(rootDir);

  const solutions = buildExistingSolutions();
  console.log(`Prepared ${solutions.length} solutions for seeding:`);
  for (const s of solutions) {
    console.log(` - ${s.typeKey} (${s.name}): ${s.fields.length} fields [Dept: ${s.department}]`);
  }

  // Also dump to JSON file for export / manual import
  const dumpPath = path.join(__dirname, "solutions-seed-data.json");
  fs.writeFileSync(dumpPath, JSON.stringify(solutions, null, 2), "utf8");
  console.log(`Exported JSON seed data to: ${dumpPath}`);

  // Upsert to Cosmos DB
  const container = await solutionsContainer();
  if ("error" in container) {
    console.warn(`Cosmos DB is not configured or unreachable: ${container.error}`);
    console.warn("Skipping live Cosmos upsert. The JSON file above can be loaded once Cosmos is ready.");
    return;
  }

  const containerName = process.env.COSMOS_SOLUTIONS_CONTAINER?.trim() || "solutions";
  console.log(`Ensuring Cosmos DB container '${containerName}' exists (partition key: /typeKey)...`);
  try {
    await container.database.containers.createIfNotExists({
      id: containerName,
      partitionKey: { paths: ["/typeKey"] },
    });
    console.log(`Container '${containerName}' is ready.`);
  } catch (err: any) {
    console.warn(`Note on container check: ${err?.message || err}`);
  }

  console.log(`Connecting to Cosmos DB container: ${containerName}...`);
  for (const solution of solutions) {
    await container.items.upsert(solution);
    console.log(`  ✓ Upserted solution: ${solution.typeKey}`);
  }

  console.log(`\nAll ${solutions.length} solutions successfully seeded into Cosmos DB!`);
}

// Only run main if invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
