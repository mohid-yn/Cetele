import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp-tools.ts";

const DRAFT = "00000000-0000-4000-8000-000000000001";
const LIVE = "00000000-0000-4000-8000-000000000002";
const ITEM = "00000000-0000-4000-8000-000000000003";
const NEW_ITEM = "00000000-0000-4000-8000-000000000004";
// Valid in Postgres, but without RFC version bits, like the seeded programme.
const SEEDED = "00000000-0000-0000-0000-0000000000f1";

type Row = Record<string, unknown>;
type Call = { fn: string; args: Row };

/** Just enough of the Supabase client to run the tools without a database. */
function fakeSupabase(tables: Record<string, Row[]>, failing: string[] = []) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    const query = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return query;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (done: (value: unknown) => void) =>
        done({ data: rows, count: rows.length, error: null }),
    };
    return query;
  };
  const rpc = async (fn: string, args: Row) => {
    calls.push({ fn, args });
    if (failing.includes(fn)) {
      return { data: null, error: { message: `${fn} failed` } };
    }
    return {
      data: fn === "roadmap_circles" ? (tables.circles ?? []) : NEW_ITEM,
      error: null,
    };
  };
  return { calls, client: { from, rpc } };
}

const tables = (): Record<string, Row[]> => ({
  roadmaps: [
    { id: DRAFT, name: "Draft", ends_on: "2099-01-01", published: false },
    { id: LIVE, name: "Live", ends_on: "2099-01-01", published: true },
    { id: SEEDED, name: "Seeded", ends_on: "2099-01-01", published: true },
  ],
  roadmap_items: [
    {
      id: ITEM,
      roadmap_id: LIVE,
      level: 1,
      category: "book",
      url: "https://old.example",
      description: "Old",
      image_url: "/cover.png",
      compulsory: true,
      sort_order: 7,
      source: "Old source",
    },
  ],
});

async function connect(
  fake: ReturnType<typeof fakeSupabase>,
  writesEnabled = true,
) {
  let writes = 0;
  const server = createMcpServer({
    supabase: fake.client as never,
    writesEnabled,
    onWrite: () => {
      writes += 1;
    },
  });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return {
    client,
    writes: () => writes,
    call: async (name: string, args: Row) => {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as { text: string }[];
      return { isError: result.isError === true, text: content[0].text };
    },
  };
}

const item = {
  level: 1,
  category: "book",
  title: "A book",
  unit: "chapters",
  target: 10,
};
const rpcNames = (fake: ReturnType<typeof fakeSupabase>) =>
  fake.calls.map((call) => call.fn);

describe("the tool menu", () => {
  it("offers only read tools when writes are off", async () => {
    const { client } = await connect(fakeSupabase(tables()), false);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "get_programme",
      "list_programmes",
    ]);
  });

  it("never offers publish, delete programme or circle tools", async () => {
    const { client } = await connect(fakeSupabase(tables()));
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "create_programme",
      "delete_item",
      "get_programme",
      "list_programmes",
      "save_item",
      "save_reward",
      "set_level_requirement",
    ]);
  });
});

describe("the drafts-only guard", () => {
  for (const [name, args] of [
    ["save_item", item],
    ["delete_item", { itemId: ITEM }],
    ["set_level_requirement", { level: 1, category: "book", minTotal: 5 }],
    ["save_reward", { threshold: 1, label: "Prize" }],
  ] as const) {
    it(`${name} refuses a published programme and writes nothing`, async () => {
      const fake = fakeSupabase(tables());
      const { call, writes } = await connect(fake);
      const result = await call(name, { programmeId: LIVE, ...args });
      assert.equal(result.isError, true);
      assert.match(result.text, /published/);
      assert.deepEqual(fake.calls, []);
      assert.equal(writes(), 0);
    });
  }

  it("reaches the guard for an id without RFC version bits", async () => {
    const fake = fakeSupabase(tables());
    const { call } = await connect(fake);
    const result = await call("save_item", { programmeId: SEEDED, ...item });
    assert.equal(result.isError, true);
    assert.match(result.text, /published/);
    assert.deepEqual(fake.calls, []);
  });

  it("refuses a published item reached by naming a draft", async () => {
    const fake = fakeSupabase(tables());
    const { call } = await connect(fake);
    for (const [name, args] of [
      ["save_item", { ...item, itemId: ITEM }],
      ["delete_item", { itemId: ITEM }],
    ] as const) {
      const result = await call(name, { programmeId: DRAFT, ...args });
      assert.equal(result.isError, true);
      assert.match(result.text, /not in this programme/);
    }
    assert.deepEqual(fake.calls, []);
  });

  it("refuses a programme that does not exist", async () => {
    const { call } = await connect(fakeSupabase(tables()));
    const result = await call("save_item", {
      programmeId: "00000000-0000-4000-8000-000000000009",
      ...item,
    });
    assert.equal(result.isError, true);
    assert.match(result.text, /not found/);
  });
});

describe("save_item", () => {
  it("adds an item, then its content, and returns the id", async () => {
    const fake = fakeSupabase(tables());
    const { call, writes } = await connect(fake);
    const result = await call("save_item", {
      programmeId: DRAFT,
      ...item,
      url: "https://new.example",
      description: "New",
    });
    assert.equal(result.isError, false);
    assert.deepEqual(JSON.parse(result.text), { itemId: NEW_ITEM });
    assert.deepEqual(rpcNames(fake), [
      "create_roadmap_item",
      "set_roadmap_item_content",
    ]);
    assert.deepEqual(fake.calls[1].args, {
      p_item: NEW_ITEM,
      p_url: "https://new.example",
      p_description: "New",
      p_image_url: "",
    });
    assert.equal(writes(), 1);
  });

  it("keeps what an edit does not mention, including the cover", async () => {
    const data = tables();
    data.roadmaps[1].published = false;
    const fake = fakeSupabase(data);
    const { call } = await connect(fake);
    const result = await call("save_item", {
      programmeId: LIVE,
      itemId: ITEM,
      ...item,
    });
    assert.equal(result.isError, false);
    assert.equal(fake.calls[0].fn, "set_roadmap_item_shape");
    assert.equal(fake.calls[0].args.p_compulsory, true);
    assert.equal(fake.calls[0].args.p_sort_order, 7);
    assert.equal(fake.calls[0].args.p_source, "Old source");
    assert.deepEqual(fake.calls[1].args, {
      p_item: ITEM,
      p_url: "https://old.example",
      p_description: "Old",
      p_image_url: "/cover.png",
    });
  });

  it("clears a field when asked, and still keeps the cover", async () => {
    const data = tables();
    data.roadmaps[1].published = false;
    const fake = fakeSupabase(data);
    const { call } = await connect(fake);
    await call("save_item", {
      programmeId: LIVE,
      itemId: ITEM,
      ...item,
      url: "",
      description: "",
    });
    assert.deepEqual(fake.calls[1].args, {
      p_item: ITEM,
      p_url: "",
      p_description: "",
      p_image_url: "/cover.png",
    });
  });

  it("returns the new id when the content step fails, so a retry edits", async () => {
    const fake = fakeSupabase(tables(), ["set_roadmap_item_content"]);
    const { call, writes } = await connect(fake);
    const result = await call("save_item", { programmeId: DRAFT, ...item });
    assert.equal(result.isError, true);
    assert.match(result.text, new RegExp(NEW_ITEM));
    assert.equal(writes(), 1);
  });

  it("passes the database's refusal back to the AI", async () => {
    const fake = fakeSupabase(tables(), ["create_roadmap_item"]);
    const { call, writes } = await connect(fake);
    const result = await call("save_item", { programmeId: DRAFT, ...item });
    assert.equal(result.isError, true);
    assert.match(result.text, /create_roadmap_item failed/);
    assert.equal(writes(), 0);
  });

  it("refuses a link that is not http(s) before touching the database", async () => {
    const fake = fakeSupabase(tables());
    const { call } = await connect(fake);
    for (const url of ["javascript:alert(1)", "ftp://example.com"]) {
      const result = await call("save_item", {
        programmeId: DRAFT,
        ...item,
        url,
      });
      assert.equal(result.isError, true, url);
    }
    assert.deepEqual(fake.calls, []);
  });

  it("refuses a category the database would reject", async () => {
    const { call } = await connect(fakeSupabase(tables()));
    const result = await call("save_item", {
      programmeId: DRAFT,
      ...item,
      category: "poetry",
    });
    assert.equal(result.isError, true);
  });
});

describe("get_programme", () => {
  it("reads a programme whose id has no RFC version bits", async () => {
    const { call } = await connect(fakeSupabase(tables()));
    const result = await call("get_programme", { programmeId: SEEDED });
    assert.equal(result.isError, false);
    assert.equal(JSON.parse(result.text).name, "Seeded");
  });

  it("counts only the circles on this programme, and hides their names", async () => {
    const data = tables();
    data.circles = [
      {
        group_id: "g1",
        name: "Secret circle",
        member_count: 3,
        following: false,
      },
    ];
    const notFollowed = await connect(fakeSupabase(data));
    const first = await notFollowed.call("get_programme", {
      programmeId: DRAFT,
    });
    assert.ok(
      JSON.parse(first.text).readiness.notes.some(
        (note: { id: string }) => note.id === "no-circles",
      ),
    );
    assert.doesNotMatch(first.text, /Secret circle/);

    data.circles[0].following = true;
    const followed = await connect(fakeSupabase(data));
    const second = await followed.call("get_programme", { programmeId: DRAFT });
    assert.ok(
      !JSON.parse(second.text).readiness.notes.some(
        (note: { id: string }) => note.id === "no-circles",
      ),
    );
  });

  it("reports publishing blockers and leaves out circle names", async () => {
    const { call } = await connect(fakeSupabase(tables()));
    const result = await call("get_programme", { programmeId: DRAFT });
    assert.equal(result.isError, false);
    const body = JSON.parse(result.text);
    assert.equal(body.readiness.blockers[0].id, "no-items");
    assert.equal("circles" in body, false);
  });
});
