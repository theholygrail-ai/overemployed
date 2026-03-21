# tools.md — Tooling Reference for This Project (Job Search, LinkedIn, CV, AI/Automation Narrative)

This file documents the **available assistant tools** (in this environment) plus the **user’s real-world AI/automation stack** that must be reflected in LinkedIn/CV keywords.

---

## 0) Operating Rules
### Tool-calling first
If a request depends on:
- uploaded documents (resume/profile PDFs),
- external websites (job posts, company info, pipsdesk.com),
- emails/calendar/contacts,
- images,
- calculations,
**call the relevant tool(s) first**, then respond with grounded output.

### Citations
- If you use `web.run`, cite sources with the tool’s citation format.
- If you use `file_search`, cite sources using `filecite...` when referencing file text.

---

## 1) Information Retrieval Tools

### 1.1 file_search (uploaded files)
Use to locate and extract text from **files uploaded in the conversation** (CVs, PDFs, etc.).

**Tools**
- `file_search.msearch`
- `file_search.mclick`

**Schema (simplified)**
```json
{
  "queries": ["string", "..."],
  "source_filter": ["files_uploaded_in_conversation"],
  "file_type_filter": ["slides" | "spreadsheets"],
  "intent": "nav",
  "time_frame_filter": {"start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD"}
}
```

---

### 1.2 web.run (internet browsing)
Use for up-to-date info: job posts, company pages, product sites (e.g., pipsdesk.com), documentation, market terms.

**Schema (simplified)**
```json
{
  "search_query": [{"q":"string","recency":30,"domains":["optional.com"]}],
  "open": [{"ref_id":"turn0search0","lineno":120}],
  "click": [{"ref_id":"turn0fetch3","id":17}],
  "find": [{"ref_id":"turn0fetch3","pattern":"string"}],
  "screenshot": [{"ref_id":"turn1view0","pageno":0}],
  "image_query": [{"q":"string","recency":365}],
  "response_length": "short"
}
```

---

## 2) Deliverable Generation

### 2.1 python_user_visible (files + visible outputs)
Use to generate:
- updated markdown files (context/memory/agent/identity/tools)
- DOCX resumes (python-docx)
- PDF resumes (reportlab)

**Tool**: `python_user_visible.exec`

---

### 2.2 artifact_handoff (spreadsheets/slides)
If the user asks for a spreadsheet or slide deck, call **first**:
- `artifact_handoff.prepare_artifact_generation`

---

## 3) Image Generation
### image_gen
Use for banners/diagrams/profile visuals.

**Tool**: `image_gen.text2im`

---

## 4) Email/Calendar/Contacts (explicit request only)
- `gmail.*` — search/read/draft/send/label
- `gcal.*` — search/create/update events
- `gcontacts.*` — find contact details by name

---

## 5) MCP (tool discovery)
Use when another tool fails or more tools are needed:
- `api_tool.list_resources`
- `api_tool.call_tool`

**MCP Schema**
```json
{"path":"","cursor":null,"only_tools":true,"refetch_tools":false}
{"path":"<resource_path>","args":{}}
```

---

## 6) User’s Real-World AI/Automation Stack (for profile keywording)
These are **not assistant tools**—they are the user’s professional tool stack and should appear in CV/LinkedIn:

- **n8n** — enterprise workflow automation and orchestration
- **Linear** — product/project tracking
- **Notion** — knowledge base, documentation, ops
- **OpenClaw** — tool referenced by user
- **Hugging Face** — models, datasets, inference ecosystem
- **Ollama** — local model serving
- **OpenAI** — LLM APIs/tooling
- **Anthropic** — LLM APIs/tooling

---

## 7) Practical Tool Decision Tree (common tasks)
1) **Update LinkedIn experience using pipsdesk.com**  
→ `web.run` (search/open/find) → write bullets.

2) **Update CV from Resume DOCX**  
→ `file_search` (confirm content) → `python_user_visible` + `python-docx` → export PDF.

3) **Build job tracking spreadsheet**  
→ `artifact_handoff.prepare_artifact_generation` → generate sheet.

4) **Draft recruiter outreach email**  
→ no tools unless drafting/sending in Gmail → `gmail.create_draft` / `gmail.send_email`.
