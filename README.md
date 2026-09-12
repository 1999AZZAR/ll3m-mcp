# LL3M Agent (Monorepo)


> **Part of the [HeLa MCP Ecosystem](https://github.com/1999AZZAR/hela-mcp-ecosystem)** — This server is **HeLa Plastid (`hela-plastid`)** — the *3D Modeling* component of the HeLa cellular architecture. See the [ecosystem docs](https://github.com/1999AZZAR/hela-mcp-ecosystem) for profiles, workflows, and multi-client setup.

A unified autonomous 3D modeling system for Blender, built on the Model Context Protocol (MCP).

[![LL3M Agent Demo](https://img.youtube.com/vi/BnbDg1-be4g/0.jpg)](https://www.youtube.com/watch?v=BnbDg1-be4g)

This project integrates the multi-agent reasoning framework from the LL3M research with a local Blender execution bridge. It provides a production-ready stack for generating 3D assets, inspecting scene hierarchies, and performing iterative refinements via natural language.

## Architecture and Origins

The system is derived from two foundational concepts:

![Blotcat plugging a cable connecting a large floating brain to a mechanical arm holding a 3D cube](assets/ll3m-illustrations/01-architecture.jpg)
- **LL3M (Large Language 3D Modelers)**: A multi-agent methodology for 3D generation through interpretable Python code. [Source](https://github.com/threedle/ll3m)
- **Blender Lab MCP**: The official vision for exposing Blender as a tool for large language models. [Documentation](https://www.blender.org/lab/mcp-server/)

## System Capabilities (v4.2)

### Autonomous Modeling Pipeline
The system implements a structured multi-agent loop to ensure geometric and physical accuracy:

![Blotcat running inside a circular conveyor belt track between Plan, Write, and Execute stations](assets/ll3m-illustrations/02-pipeline.jpg)
- **Planner**: Decomposes natural language requests into discrete geometric components and spatial requirements.
- **Writer**: Translates modeling plans into modular Python scripts utilizing `bpy` and `bmesh`.
- **Debugger**: Analyzes execution tracebacks and visual feedback to perform automated error correction.

### Local Retrieval-Augmented Generation (RAG)
Integrated Python-based RST parser that provides agents with:

![Blotcat fishing a puzzle piece with code out of a giant glowing book](assets/ll3m-illustrations/03-rag.jpg)
- Fully qualified API signatures for `bpy` and `bmesh`.
- Contextual usage examples extracted from official documentation.
- Automatic truncation and navigation for large module references.

### Scene and Object Intelligence
- **Hierarchical Summarization**: Detailed mapping of collections, object visibility, and active selection states.
- **Technical Inspection**: Direct access to mesh data, material node trees, and modifier stacks.
- **Visual Feedback**: Real-time viewport screenshot capture and high-resolution background rendering.

## Repository Structure

- `/brain`: Node.js/TypeScript MCP server handling agent orchestration and documentation retrieval.
- `/body`: Python environment containing the Blender bridge, modeling tools, and full API RAG dataset.
- `/skill`: Gemini CLI skill definition for managing the autonomous workflow.

## Installation and Setup

### 1. MCP Configuration
Install and build the TypeScript server:

```bash
cd /path/to/ll3m-mcp/brain
npm install
npm run build
```

Register the built server in your MCP client configuration (for example, `~/.claude.json`):

```json
{
  "mcpServers": {
    "ll3m": {
      "command": "node",
      "args": ["/path/to/ll3m-mcp/brain/dist/index.js"]
    }
  }
}
```

Restart the MCP client after changing its configuration.

### 2. Blender Add-on

Install the packaged add-on at:

`add_on/blender_mcp_addon-audited.zip`

In Blender 5.2 or later:

1. Open **Edit > Preferences > Add-ons**.
2. Open the add-on menu in the upper-right and choose **Install from Disk**.
3. Select `add_on/blender_mcp_addon-audited.zip`. Install the ZIP directly; do not extract it first.
4. Enable the add-on named **MCP**.
5. Expand its preferences and keep **Host** set to `localhost` and **Port** set to `9876`.
6. Click **Start Server** and leave Blender open while using LL3M.

The bridge intentionally accepts loopback connections only because MCP tools can execute Python inside Blender. Do not expose port `9876` to a network.

### 3. Verify the Connection

Ask the MCP client to call `get_scene_summary`. A successful response reports the active scene, workspace, and objects. If the connection fails:

- Confirm Blender is running and **Start Server** was clicked.
- Confirm no other Blender instance is already using port `9876`.
- Confirm the MCP client was restarted after configuration changes.
- Rebuild `brain/dist` after changing TypeScript source.

## Environment Variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `HELA_ENVELOPE` | *unset = off* | Set to `true` to wrap tool results in the canonical HeLaResult envelope (`ok/summary/data/artifacts/provenance/warnings/sideEffects/execution`; `blender-execute`/`save`/`render`/`navigate` report `sideEffects`). Off = byte-identical legacy output. Run/step ids propagate from `HELA_RUN_ID`/`HELA_STEP_ID`. |

## Operation

Execute the modeling loop by providing a technical or descriptive request:
> "Use the ll3m-mcp skill to generate a minimalist industrial interior with a glass-top table."

The system will proceed through the PLAN → RETRIEVE → WRITE → EXECUTE cycle automatically.
