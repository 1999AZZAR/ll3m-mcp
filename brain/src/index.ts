import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { textResult } from "./envelope.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import net from "net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths relative to dist/ or src/
const BODY_PATH = path.join(__dirname, "../../body");
const BLENDER_MCP_DATA = path.join(BODY_PATH, "mcp/blmcp/data/api");
const PATTERNS_PATH = path.join(BODY_PATH, "mcp/blmcp/data/patterns");
const TOOLS_CODE_PATH = path.join(BODY_PATH, "mcp/blmcp/tools");
const PYTHON_INTERPRETER = path.join(BODY_PATH, "venv/bin/python3");
const API_BRIDGE_PATH = path.join(__dirname, "api_docs_bridge.py");

// Blender Socket Params
const BLENDER_HOST = "localhost";
const BLENDER_PORT = 9876;

const server = new Server(
  {
    name: "ll3m-agent-server",
    version: "4.2.0",
    description: "Recursive Staged Inverse Graphics LL3M Agent: Perfect Clone Loop",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Communicates with the Blender addon via TCP socket.
 */
async function sendToBlender(code: string, strictJson: boolean = false): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let responseData = Buffer.alloc(0);

    client.connect(BLENDER_PORT, BLENDER_HOST, () => {
      const request = JSON.stringify({
        type: "execute",
        code: code,
        strict_json: strictJson,
      }) + "\0";
      client.write(request);
    });

    client.on("data", (data: any) => {
      responseData = Buffer.concat([responseData, Buffer.from(data)]);
      if (responseData.includes(0)) {
        client.destroy();
      }
    });

    client.on("close", () => {
      try {
        const nullIndex = responseData.indexOf(0);
        const jsonStr = responseData.slice(0, nullIndex === -1 ? undefined : nullIndex).toString("utf8");
        if (!jsonStr) {
           resolve({ status: "error", message: "Empty response from Blender. Ensure 'Start Server' is clicked in the Blender addon." });
           return;
        }
        resolve(JSON.parse(jsonStr));
      } catch (e) {
        reject(e);
      }
    });

    client.on("error", (err) => {
      reject(new Error(`Connection failed: ${err.message}. Ensure Blender is open and the MCP addon server is running.`));
    });
    
    client.setTimeout(300000); 
    client.on("timeout", () => { client.destroy(); reject(new Error("Timeout")); });
  });
}

/**
 * Helper to run a tool code file from the body.
 */
async function runBodyTool(toolName: string, params: any = null): Promise<any> {
    const filePath = path.join(TOOLS_CODE_PATH, `${toolName}_toolcode.py`);
    let code = await fs.readFile(filePath, "utf8");

    const includePattern = /^# @include_begin: (.+)\n[\s\S]*?^# @include_end\s*$/gm;
    const includes = [...code.matchAll(includePattern)];
    for (const include of includes) {
      const includeCode = await fs.readFile(path.join(TOOLS_CODE_PATH, include[1]), "utf8");
      code = code.replace(include[0], includeCode.trimEnd());
    }
    
    const paramsJson = JSON.stringify(JSON.stringify(params));
    code += `
import json
try:
    params_dict = json.loads(${paramsJson})
    if 'Params' in locals() or 'Params' in globals():
        p = Params() if params_dict is None else Params(**params_dict)
    else:
        p = params_dict
    _rv = main(p)
    if callable(_rv):
        check_is_finished = _rv
        result = {}
    else:
        result = _rv._asdict() if hasattr(_rv, "_asdict") else _rv
except Exception as e:
    import traceback
    result = {"status": "error", "message": str(e), "trace": traceback.format_exc()}
`;
    return await sendToBlender(code, true);
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_modeling_plan",
        description: "Generate a multi-component 3D modeling plan with high-fidelity mandates.",
        inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] },
      },
      {
        name: "get_agent_instructions",
        description: "Retrieve specialized persona instructions (planner/writer/debugger/critic).",
        inputSchema: { type: "object", properties: { agent: { type: "string", enum: ["planner", "writer", "debugger", "critic"] } }, required: ["agent"] },
      },
      {
        name: "get_api_docs",
        description: "Advanced Blender Python API RAG: Get precise documentation, examples, and signatures.",
        inputSchema: { type: "object", properties: { identifier: { type: "string", description: "fully-qualified name, e.g. 'bpy.types.Scene', or '*' for module list." } }, required: ["identifier"] },
      },
      {
        name: "get_modeling_patterns",
        description: "Retrieve high-fidelity modeling blueprints (e.g., rounded corners, SubD topology).",
        inputSchema: { 
            type: "object", 
            properties: { 
                category: { type: "string", enum: ["rounded_corners", "ergonomic_curves", "subd_topology", "realistic_materials"] } 
            }, 
            required: ["category"] 
        },
      },
      {
        name: "get_blender_helpers",
        description: "Retrieve a list of high-level Python helper functions available in the Blender environment (e.g., setup_pbr, apply_subd).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "execute_blender_code",
        description: "Execute arbitrary Python code in Blender.",
        inputSchema: { type: "object", properties: { code: { type: "string" }, strict_json: { type: "boolean" } }, required: ["code"] },
      },
      {
        name: "get_scene_summary",
        description: "Comprehensive scene map: objects, collections, modes, and active selection.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_object_details",
        description: "Deep dive into an object's mesh, materials, modifiers, and animation status.",
        inputSchema: { type: "object", properties: { object_name: { type: "string" } }, required: ["object_name"] },
      },
      {
        name: "get_blendfile_summary",
        description: "Detailed summary of the .blend file (datablocks, missing files, linked libraries).",
        inputSchema: { type: "object", properties: { type: { type: "string", enum: ["datablocks", "missing_files", "linked_libraries", "path_info", "usage_guess"] } }, required: ["type"] },
      },
      {
        name: "render_output",
        description: "Render the current scene or viewport.",
        inputSchema: { type: "object", properties: { type: { type: "string", enum: ["viewport", "thumbnail"] }, output_path: { type: "string" } }, required: ["type"] },
      },
      {
        name: "save_blend",
        description: "Save current Blender file or a copy.",
        inputSchema: { type: "object", properties: { filepath: { type: "string" }, as_copy: { type: "boolean", default: false } }, required: ["filepath"] },
      },
      {
        name: "get_screenshot",
        description: "Capture high-speed viewport screenshot (returns base64).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_fast_feedback",
        description: "Capture a low-resolution, high-speed Workbench screenshot for agent self-criticism.",
        inputSchema: { 
            type: "object", 
            properties: { 
                output_path: { type: "string" },
                resolution_scale: { type: "integer", default: 30, description: "Scale percentage (1-100)." }
            } 
        },
      },
      {
        name: "navigation",
        description: "Jump to a specific tab, workspace, or focus an object in the 3D view.",
        inputSchema: { 
            type: "object", 
            properties: { 
                action: { type: "string", enum: ["jump_to_tab", "focus_object", "focus_data"] },
                name: { type: "string", description: "Name of tab/object/data" }
            }, 
            required: ["action", "name"] 
        },
      },
      {
        name: "execute_staged_refinement",
        description: "Execute a technical Geometric Delta provided by the Critic. Use this recursively until the Quality Score reaches 90+.",
        inputSchema: { 
            type: "object", 
            properties: { 
                delta_instructions: { type: "string", description: "Technical instructions for refinements." } 
            }, 
            required: ["delta_instructions"] 
        },
      },

    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "generate_modeling_plan":
      const planPrompt = await fs.readFile(path.join(__dirname, "agents/prompts/planner.md"), "utf8");
      return textResult(name, `PLANNER_INSTRUCTIONS:\n${planPrompt}\n\nUSER_REQUEST: ${args?.prompt}` );

    case "get_agent_instructions":
      const instructions = await fs.readFile(path.join(__dirname, `agents/prompts/${args?.agent}.md`), "utf8");
      return textResult(name, instructions );

    case "get_api_docs":
      try {
        const result = execFileSync(PYTHON_INTERPRETER, [API_BRIDGE_PATH, String(args?.identifier)], {
          encoding: "utf8",
          timeout: 30_000,
          maxBuffer: 4 * 1024 * 1024,
        });
        return textResult(name, result );
      } catch (e: any) {
        return textResult(name, "Error fetching docs: " + e.message );
      }

    case "get_modeling_patterns":
        try {
            const patternContent = await fs.readFile(path.join(PATTERNS_PATH, `${args?.category}.md`), "utf8");
            return textResult(name, patternContent );
        } catch (e: any) {
            return textResult(name, "Error fetching pattern: " + e.message );
        }

    case "get_blender_helpers":
        try {
            const helperPath = path.join(BODY_PATH, "addon/blender_mcp_addon/blmcp_helpers.py");
            const helpers = await fs.readFile(helperPath, "utf8");
            return textResult(name, "Available high-level Python helpers:\n\n" + helpers );
        } catch (e: any) {
            return textResult(name, "Error fetching helpers: " + e.message );
        }

    case "execute_blender_code":
        try {
          const result = await sendToBlender(args?.code as string, !!args?.strict_json);
          return textResult(name, JSON.stringify(result, null, 2) );
        } catch (e: any) {
          return textResult(name, "Error: " + e.message );
        }

    case "get_scene_summary":
        const sceneRes = await runBodyTool("get_objects_summary");
        return textResult(name, JSON.stringify(sceneRes, null, 2) );

    case "get_object_details":
        const objRes = await runBodyTool("get_object_detail_summary", { name: args?.object_name });
        return textResult(name, JSON.stringify(objRes, null, 2) );

    case "get_blendfile_summary":
        const summaryTools: Record<string, string> = {
          datablocks: "get_blendfile_summary_datablocks",
          missing_files: "get_blendfile_summary_missing_files",
          linked_libraries: "get_blendfile_summary_of_linked_libraries",
          path_info: "get_blendfile_summary_path_info",
          usage_guess: "get_blendfile_summary_usage_guess",
        };
        const blendRes = await runBodyTool(summaryTools[String(args?.type)]);
        return textResult(name, JSON.stringify(blendRes, null, 2) );

    case "render_output":
        const tool = args?.type === "viewport" ? "render_viewport_to_path" : "render_thumbnail_to_path";
        const rendRes = await runBodyTool(tool, { output_path: args?.output_path || "render.png" });
        return textResult(name, JSON.stringify(rendRes, null, 2) );

    case "save_blend":
        const copyFlag = args?.as_copy ? ", copy=True" : "";
        const filepath = JSON.stringify(String(args?.filepath));
        const saveCode = `import bpy; bpy.ops.wm.save_as_mainfile(filepath=${filepath}${copyFlag})\nresult={"status":"saved"}`;
        const saveRes = await sendToBlender(saveCode, true);
        return textResult(name, JSON.stringify(saveRes, null, 2) );

    case "get_screenshot":
        const screenRes = await runBodyTool("get_screenshot_of_window_as_image", { size_limit_in_bytes: 0 });
        return textResult(name, JSON.stringify(screenRes, null, 2) );

    case "get_fast_feedback":
        const fastPath = JSON.stringify(String(args?.output_path || "critic_feedback.png"));
        const scale = Math.min(100, Math.max(1, Number(args?.resolution_scale) || 30));
        const fastRes = await sendToBlender(
          `result = helpers.get_fast_feedback(${fastPath}, resolution_scale=${scale})`,
          true,
        );
        return textResult(name, JSON.stringify(fastRes, null, 2) );

    case "navigation":
        let navTool = "";
        if (args?.action === "jump_to_tab") navTool = "jump_to_tab_by_name";
        else if (args?.action === "focus_object") navTool = "jump_to_view3d_object_by_name";
        else navTool = "jump_to_view3d_object_data_by_name";
        const navRes = await runBodyTool(navTool, { name: args?.name });
        return textResult(name, JSON.stringify(navRes, null, 2) );

    case "execute_staged_refinement":
        try {
            // This tool takes Critic deltas (Python code snippets) and executes them in a clean namespace
            const result = await sendToBlender(args?.delta_instructions as string, true);
            return textResult(name, JSON.stringify(result, null, 2) );
        } catch (e: any) {
            return textResult(name, "Error during refinement: " + e.message );
        }

    default:
      throw new Error("Tool not found");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
