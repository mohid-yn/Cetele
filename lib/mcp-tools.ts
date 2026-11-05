import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types.ts";
import { programmeReadiness } from "./programme-readiness.ts";
import { CATEGORY_LABEL, type RoadmapCategory } from "./roadmap.ts";

/**
 * The tools an organiser's AI app can call (docs/MCP_PLAN.md).
 *
 * THIN RELAYS, like `authoring-actions.ts`. Permissions, the freeze on recorded
 * work and the audit log all live in the RPCs. The one rule added here is DRAFTS
 * ONLY: nothing an AI does reaches members until a person publishes it in the app.
 * That guard catches mistakes. It is not a security boundary, because the token
 * also works against Supabase directly (plan §5).
 *
 * LEFT OUT ON PURPOSE: publish, deleting a programme, circle assignment, and
 * anything that reads progress or members.
 */
type Db = SupabaseClient<Database>;

const INSTRUCTIONS = `Builds draft Cetele programmes for an organiser. A programme has levels that a member completes in order, and each level has items of work grouped by category.

Religious content must be accurate:
- Only use titles, sources, citations and links that the organiser provided or that you verified.
- Never invent a hadith, verse reference, quote, author or link. If you are unsure, leave the field empty and tell the organiser.

Everything stays an unpublished draft. Tell the organiser to review it and publish it in the app, and name anything they should check. Run get_programme when finished and report any publishing blockers.`;

const CATEGORY_VALUES = [
  "book",
  "quran",
  "quran_studies",
  "memorisation",
  "listening",
] as const satisfies readonly RoadmapCategory[];

// `guid`, not `uuid`: Zod's uuid also requires the RFC version bits and Postgres does
// not. The seeded programme's id (00000000-...-f1) is valid in the database, and
// `uuid` refused it.
const id = z.guid();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");
const level = z.number().int().min(1).max(20);
const category = z.enum(CATEGORY_VALUES);

const text = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
});
const refuse = (message: string) => ({ ...text(message), isError: true });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));

/** Null when the programme is a draft, otherwise the reason to refuse the write. */
async function draftRefusal(
  supabase: Db,
  programmeId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("roadmaps")
    .select("published")
    .eq("id", programmeId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "Programme not found.";
  return data.published
    ? "This programme is published, so it can only be changed in the Cetele app."
    : null;
}

export function createMcpServer({
  supabase,
  writesEnabled,
  onWrite,
}: {
  supabase: Db;
  writesEnabled: boolean;
  /** Refreshes the screens that show a programme. Injected so tests need no Next. */
  onWrite: () => void;
}): McpServer {
  const server = new McpServer(
    { name: "cetele", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "list_programmes",
    {
      description:
        "List all Cetele programmes with their dates and whether each is published.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await supabase
        .from("roadmaps")
        .select("id, name, starts_on, ends_on, published")
        .order("starts_on", { ascending: false });
      return error ? refuse(error.message) : json(data);
    },
  );

  server.registerTool(
    "get_programme",
    {
      description:
        "Read one programme: its items, level requirements and rewards, plus what would block publishing it.",
      inputSchema: { programmeId: id },
      annotations: { readOnlyHint: true },
    },
    async ({ programmeId }) => {
      const [programme, items, requirements, rewards, circles] =
        await Promise.all([
          supabase
            .from("roadmaps")
            .select("id, name, starts_on, ends_on, published")
            .eq("id", programmeId)
            .maybeSingle(),
          supabase
            .from("roadmap_items")
            .select(
              "id, level, category, title, source, unit, target, compulsory, sort_order, url, description",
            )
            .eq("roadmap_id", programmeId)
            .order("level")
            .order("sort_order"),
          supabase
            .from("roadmap_level_requirements")
            .select("level, category, min_total")
            .eq("roadmap_id", programmeId),
          supabase
            .from("roadmap_rewards")
            .select("id, threshold, label, description")
            .eq("roadmap_id", programmeId),
          supabase.rpc("roadmap_circles", { p_roadmap: programmeId }),
        ]);

      const failed =
        programme.error ??
        items.error ??
        requirements.error ??
        rewards.error ??
        circles.error;
      if (failed) return refuse(failed.message);
      if (!programme.data) return refuse("Programme not found.");

      const itemRows = items.data ?? [];
      const requirementRows = requirements.data ?? [];
      const rewardRows = rewards.data ?? [];
      const readiness = programmeReadiness({
        items: itemRows.map((item) => ({
          level: item.level,
          category: item.category,
          categoryLabel:
            CATEGORY_LABEL[item.category as RoadmapCategory] ?? item.category,
          unit: item.unit,
          target: item.target,
        })),
        requirements: requirementRows.map((row) => ({
          level: row.level,
          category: row.category,
          minTotal: row.min_total,
        })),
        rewards: rewardRows,
        endsOn: programme.data.ends_on,
        todayISO: new Date().toISOString().slice(0, 10),
        // `roadmap_circles` lists every circle, with a flag for those on this
        // programme. Only the count is used, so circle names never reach the AI.
        circles: (circles.data ?? []).filter((circle) => circle.following)
          .length,
      });

      return json({
        ...programme.data,
        items: itemRows,
        levelRequirements: requirementRows,
        rewards: rewardRows,
        readiness,
      });
    },
  );

  if (!writesEnabled) return server;

  server.registerTool(
    "create_programme",
    {
      description:
        "Create a new, empty programme. It always starts as an unpublished draft that members cannot see.",
      inputSchema: {
        name: z.string().trim().min(1).max(120),
        startsOn: isoDate,
        endsOn: isoDate,
      },
    },
    async ({ name, startsOn, endsOn }) => {
      const { data, error } = await supabase.rpc("create_roadmap", {
        p_name: name,
        p_starts_on: startsOn,
        p_ends_on: endsOn,
      });
      if (error) return refuse(error.message);
      onWrite();
      return json({ programmeId: data, published: false });
    },
  );

  server.registerTool(
    "save_item",
    {
      description:
        "Add an item of work to a draft programme, or edit one by passing itemId. Keep the returned itemId, and use it when retrying so the item is not added twice. Leaving out url, description or sortOrder when editing keeps the current value.",
      inputSchema: {
        programmeId: id,
        itemId: id.optional(),
        level,
        category,
        title: z.string().trim().min(1).max(200),
        source: z
          .string()
          .trim()
          .max(300)
          .optional()
          .describe(
            "Author or edition, only if provided by the organiser or verified",
          ),
        unit: z
          .string()
          .trim()
          .min(1)
          .max(50)
          .describe(
            'A plural such as "minutes", "juz" or "chapters". Must match across a category that has a level requirement',
          ),
        target: z
          .number()
          .int()
          .min(1)
          .max(1000000)
          .describe("How many units finish the item. 1 means a yes/no item"),
        compulsory: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(100000).optional(),
        url: z
          .string()
          .trim()
          .max(2000)
          .regex(/^($|https?:\/\/)/i, "A link must start with http(s)://")
          .optional()
          .describe("An empty string clears the link"),
        description: z
          .string()
          .trim()
          .max(4000)
          .optional()
          .describe("An empty string clears the description"),
      },
    },
    async (input) => {
      const refusal = await draftRefusal(supabase, input.programmeId);
      if (refusal) return refuse(refusal);

      let existing: {
        roadmap_id: string;
        url: string | null;
        description: string | null;
        image_url: string | null;
        compulsory: boolean;
        sort_order: number;
        source: string | null;
      } | null = null;

      if (input.itemId) {
        const { data, error } = await supabase
          .from("roadmap_items")
          .select(
            "roadmap_id, url, description, image_url, compulsory, sort_order, source",
          )
          .eq("id", input.itemId)
          .maybeSingle();
        if (error) return refuse(error.message);
        // The draft check above was for `programmeId`, so an item from a published
        // programme must not get through by naming a draft next to it.
        if (!data || data.roadmap_id !== input.programmeId) {
          return refuse("That item is not in this programme.");
        }
        existing = data;
      }

      let sortOrder = input.sortOrder ?? existing?.sort_order;
      if (sortOrder === undefined) {
        const { count, error } = await supabase
          .from("roadmap_items")
          .select("id", { count: "exact", head: true })
          .eq("roadmap_id", input.programmeId)
          .eq("level", input.level)
          .eq("category", input.category);
        if (error) return refuse(error.message);
        sortOrder = count ?? 0;
      }

      const shape = {
        p_level: input.level,
        p_category: input.category,
        p_title: input.title,
        p_source: input.source ?? existing?.source ?? "",
        p_unit: input.unit,
        p_target: input.target,
        p_compulsory: input.compulsory ?? existing?.compulsory ?? false,
        p_sort_order: sortOrder,
      };

      let itemId = input.itemId;
      if (itemId) {
        const { error } = await supabase.rpc("set_roadmap_item_shape", {
          p_item: itemId,
          ...shape,
        });
        if (error) return refuse(error.message);
      } else {
        const { data, error } = await supabase.rpc("create_roadmap_item", {
          p_roadmap: input.programmeId,
          ...shape,
        });
        if (error) return refuse(error.message);
        itemId = data;
      }
      onWrite();

      // This RPC overwrites all three fields, so anything not being changed is
      // sent back as it was. Otherwise an edit would wipe the item's cover image.
      const { error } = await supabase.rpc("set_roadmap_item_content", {
        p_item: itemId,
        p_url: input.url ?? existing?.url ?? "",
        p_description: input.description ?? existing?.description ?? "",
        p_image_url: existing?.image_url ?? "",
      });
      if (error) {
        return refuse(
          `The item was saved as ${itemId}, but its link and description were not: ${error.message}. Retry with this itemId, so it is not added twice.`,
        );
      }
      return json({ itemId });
    },
  );

  server.registerTool(
    "delete_item",
    {
      description: "Remove an item from a draft programme.",
      inputSchema: { programmeId: id, itemId: id },
      annotations: { destructiveHint: true },
    },
    async ({ programmeId, itemId }) => {
      const refusal = await draftRefusal(supabase, programmeId);
      if (refusal) return refuse(refusal);

      const { data, error: readError } = await supabase
        .from("roadmap_items")
        .select("roadmap_id")
        .eq("id", itemId)
        .maybeSingle();
      if (readError) return refuse(readError.message);
      if (!data || data.roadmap_id !== programmeId) {
        return refuse("That item is not in this programme.");
      }

      const { error } = await supabase.rpc("delete_roadmap_item", {
        p_item: itemId,
      });
      if (error) return refuse(error.message);
      onWrite();
      return text("Item removed.");
    },
  );

  server.registerTool(
    "set_level_requirement",
    {
      description:
        "On a draft programme, set the minimum total a level requires in a category, counted in the items' unit, such as 600 minutes of listening. Pass null so that every item in the category must be finished instead.",
      inputSchema: {
        programmeId: id,
        level,
        category,
        minTotal: z.number().int().min(1).max(1000000).nullable(),
      },
    },
    async ({ programmeId, level, category, minTotal }) => {
      const refusal = await draftRefusal(supabase, programmeId);
      if (refusal) return refuse(refusal);

      const { error } = await supabase.rpc("set_roadmap_level_requirement", {
        p_roadmap: programmeId,
        p_level: level,
        p_category: category,
        // The generated type says number, and the function treats null as "clear".
        p_min_total: minTotal as number,
      });
      if (error) return refuse(error.message);
      onWrite();
      return text("Requirement saved.");
    },
  );

  server.registerTool(
    "save_reward",
    {
      description:
        "Add a reward to a draft programme, or edit one by passing rewardId. The threshold is how many finished levels earn it.",
      inputSchema: {
        programmeId: id,
        rewardId: id.optional(),
        threshold: z.number().int().min(1).max(20),
        label: z.string().trim().min(1).max(120),
        description: z.string().trim().max(1000).optional(),
      },
    },
    async ({ programmeId, rewardId, threshold, label, description }) => {
      const refusal = await draftRefusal(supabase, programmeId);
      if (refusal) return refuse(refusal);

      if (rewardId) {
        const { data, error } = await supabase
          .from("roadmap_rewards")
          .select("roadmap_id")
          .eq("id", rewardId)
          .maybeSingle();
        if (error) return refuse(error.message);
        if (!data || data.roadmap_id !== programmeId) {
          return refuse("That reward is not in this programme.");
        }
      }

      const { data, error } = await supabase.rpc("upsert_roadmap_reward", {
        p_roadmap: programmeId,
        p_threshold: threshold,
        p_label: label,
        p_description: description ?? "",
        ...(rewardId ? { p_reward: rewardId } : {}),
      });
      if (error) return refuse(error.message);
      onWrite();
      return json({ rewardId: data });
    },
  );

  return server;
}
