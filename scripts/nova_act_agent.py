#!/usr/bin/env python3
"""
Nova Act + Groq planner loop for job applications.
Protocol: first stdin line = JSON command; stdout = NDJSON events.
After a blocker event, read one stdin line: {"cmd":"resume"} or {"cmd":"skip"}.
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

MAX_PLANNER_STEPS = 28
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_PLANNER_MODEL = "openai/gpt-oss-120b"
TAILORED_CV_MAX = 14000


def send_event(event_type: str, **kwargs) -> None:
    msg = {"type": event_type, **kwargs}
    print(json.dumps(msg), flush=True)


def send_progress(message: str) -> None:
    send_event("progress", message=message)


def send_blocker(reason: str, screenshot_b64: str | None, url: str | None) -> None:
    send_event("blocker", reason=reason, screenshot=screenshot_b64, url=url)


def send_success(message: str = "Application submitted", screenshot_b64: str | None = None) -> None:
    send_event("success", message=message, screenshot=screenshot_b64)


def send_error(message: str) -> None:
    send_event("error", message=message)


def read_stdin_line() -> str:
    line = sys.stdin.readline()
    return line.strip() if line else ""


def groq_chat(messages: list, api_key: str, model: str) -> str:
    if not api_key:
        raise ValueError("GROQ_API_KEY missing")
    body = json.dumps(
        {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 2048,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        GROQ_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Groq HTTP {e.code}: {err_body}") from e
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Groq returned no choices")
    return (choices[0].get("message") or {}).get("content") or ""


def extract_json_object(text: str) -> dict:
    text = text.strip()
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise ValueError("No JSON object in planner response")
    return json.loads(m.group())


def to_playwright_cookies(raw_list: list) -> list:
    out = []
    for c in raw_list or []:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "").strip()
        if not name:
            continue
        domain = str(c.get("domain") or "").strip()
        if not domain:
            continue
        entry = {
            "name": name,
            "value": str(c.get("value", "")),
            "domain": domain,
            "path": str(c.get("path") or "/"),
        }
        if c.get("expires") is not None:
            try:
                entry["expires"] = float(c["expires"])
            except (TypeError, ValueError):
                pass
        if isinstance(c.get("httpOnly"), bool):
            entry["httpOnly"] = c["httpOnly"]
        if isinstance(c.get("secure"), bool):
            entry["secure"] = c["secure"]
        ss = c.get("sameSite")
        if ss in ("Strict", "Lax", "None"):
            entry["sameSite"] = ss
        out.append(entry)
    return out


def apply_cookies_to_context(nova, cookies: list) -> int:
    if not cookies:
        return 0
    pw = to_playwright_cookies(cookies)
    if not pw:
        return 0
    try:
        nova.page.context.add_cookies(pw)
    except Exception as e:
        send_progress(f"Cookie injection warning: {e}")
        return 0
    return len(pw)


def collect_upload_allow_paths(command: dict) -> list:
    paths = []
    for key in ("pdfPath", "docxPath", "cvPath"):
        p = command.get(key)
        if p and isinstance(p, str) and p.strip():
            paths.append(os.path.dirname(p.strip()))
    seen = set()
    uniq = []
    for d in paths:
        if d and d not in seen:
            seen.add(d)
            uniq.append(d)
    return uniq


def maybe_type_password(nova, password: str | None) -> None:
    if not password:
        return
    try:
        nova.page.keyboard.type(password, delay=20)
    except Exception as e:
        send_progress(f"Password typing via Playwright failed: {e}")


def _password_for_host(credentials_by_host: dict, hostname: str) -> str | None:
    if not hostname or not isinstance(credentials_by_host, dict):
        return None
    hn = hostname.lower()
    for h, cred in credentials_by_host.items():
        if not h or not isinstance(cred, dict):
            continue
        hl = str(h).lower().lstrip(".")
        if hl in hn or hn.endswith("." + hl) or hn == hl:
            p = cred.get("password")
            return str(p) if p is not None else None
    return None


def run_apply(command: dict) -> None:
    try:
        from nova_act import NovaAct, SecurityOptions, BOOL_SCHEMA
    except ImportError:
        send_error("nova-act package not installed. Run: pip install nova-act")
        return

    url = str(command.get("url") or "").strip()
    if not url:
        send_error("Missing url in command")
        return

    nova_key = command.get("novaActApiKey") or os.environ.get("NOVA_ACT_API_KEY", "")
    if not nova_key:
        send_error("NOVA_ACT_API_KEY not set (pass novaActApiKey or env)")
        return

    groq_key = command.get("groqApiKey") or os.environ.get("GROQ_API_KEY", "")
    if not str(groq_key).strip():
        send_error("GROQ_API_KEY not set (required for planner; set on API server or WSL env)")
        return

    planner_model = command.get("plannerModel") or os.environ.get(
        "GROQ_NOVA_PLANNER_MODEL", DEFAULT_PLANNER_MODEL
    )

    profile = command.get("profile") or {}
    tailored = str(command.get("tailoredCV") or "")[:TAILORED_CV_MAX]
    company = str(command.get("company") or "")
    role = str(command.get("roleTitle") or "")
    pdf_path = str(command.get("pdfPath") or "").strip()
    docx_path = str(command.get("docxPath") or "").strip()
    cookies = command.get("sessionCookies") or []
    credentials_by_host = command.get("siteCredentials") or {}
    headless = bool(command.get("headless", False))

    upload_dirs = collect_upload_allow_paths(command)
    security_options = None
    if upload_dirs:
        security_options = SecurityOptions(allowed_file_upload_paths=upload_dirs)

    nova_kwargs = {
        "starting_page": url,
        "nova_act_api_key": nova_key,
        "headless": headless,
    }
    if security_options:
        nova_kwargs["security_options"] = security_options

    name = str(profile.get("name") or "")
    email = str(profile.get("email") or "")
    phone = str(profile.get("phone") or "")

    send_progress(f"Opening {url}")

    with NovaAct(**nova_kwargs) as nova:
        n = apply_cookies_to_context(nova, cookies)
        if n:
            send_progress(f"Injected {n} session cookie(s) into browser context")
        try:
            nova.go_to_url(url)
        except Exception as e:
            send_progress(f"Navigation note: {e}")

        last_summary = "Session started."
        step = 0

        while step < MAX_PLANNER_STEPS:
            step += 1
            send_progress(f"Planner step {step}/{MAX_PLANNER_STEPS}")

            sys_prompt = """You orchestrate a browser agent (Nova Act) applying for a job.
Return ONLY a JSON object with keys:
- "next_instruction": string — one clear imperative for the browser agent (one focused action or small group).
- "phase": one of "explore" | "login" | "fill" | "upload" | "review" | "submit" | "verify"
- "needs_human": boolean — true if the page needs CAPTCHA, unusual human verification, or manual steps you cannot safely automate.
- "human_reason": string or null — short reason if needs_human.
- "use_password_keyboard": boolean — true ONLY when phase is login and the next step is to type the password; do NOT put the password in JSON.
- "done": boolean — true only after application is submitted and confirmed.

Rules:
- Never include passwords or secrets in "next_instruction" or any field.
- For login: instruct to enter username/email and focus password field; set use_password_keyboard true for the step where password should be typed.
- Keep instructions short and specific to the current page.
- If already on a confirmation/thank-you page, set phase verify and done true with next_instruction describing verification."""

            user_content = f"""Job: {role} at {company}
URL: {url}
Applicant name: {name}
Email: {email}
Phone: {phone}
CV PDF path (for uploads): {pdf_path or "none"}
DOCX path: {docx_path or "none"}

Tailored CV / cover letter (use for answers):
---
{tailored}
---

Last agent result summary: {last_summary}

What should the browser agent do next?"""

            try:
                raw = groq_chat(
                    [
                        {"role": "system", "content": sys_prompt},
                        {"role": "user", "content": user_content},
                    ],
                    groq_key,
                    planner_model,
                )
                plan = extract_json_object(raw)
            except Exception as e:
                send_progress(f"Planner error, using fallback explore step: {e}")
                plan = {
                    "next_instruction": "Scroll through the page and locate the job application or Easy Apply entry point.",
                    "phase": "explore",
                    "needs_human": False,
                    "human_reason": None,
                    "use_password_keyboard": False,
                    "done": False,
                }

            if plan.get("needs_human"):
                reason = plan.get("human_reason") or "Human verification or CAPTCHA may be required"
                try:
                    shot = nova.page.screenshot()
                    b64 = base64.b64encode(shot).decode() if shot else None
                except Exception:
                    b64 = None
                send_blocker(reason, b64, nova.page.url)
                cmd_line = read_stdin_line()
                try:
                    ctrl = json.loads(cmd_line) if cmd_line else {}
                except json.JSONDecodeError:
                    ctrl = {}
                if ctrl.get("cmd") != "resume":
                    send_error("Blocked: intervention skipped or aborted")
                    return
                send_progress("Resuming after human intervention")
                last_summary = "User resolved blocker; continuing."
                continue

            if plan.get("done"):
                try:
                    result = nova.act_get(
                        "Is there clear evidence on this page that the job application was submitted successfully "
                        "(thank you, confirmation number, application received)?",
                        schema=BOOL_SCHEMA,
                    )
                    ok = bool(result.parsed_response)
                except Exception as e:
                    send_progress(f"Verification act_get failed: {e}")
                    ok = False
                if ok:
                    try:
                        shot = nova.page.screenshot()
                        sb64 = base64.b64encode(shot).decode() if shot else None
                    except Exception:
                        sb64 = None
                    send_success("Application submitted (verified)", screenshot_b64=sb64)
                else:
                    send_error("Could not verify application submission on screen")
                return

            instruction = str(plan.get("next_instruction") or "").strip()
            if not instruction:
                instruction = "Summarize what you see on the page and the main call-to-action for applying."

            if plan.get("use_password_keyboard"):
                try:
                    from urllib.parse import urlparse

                    host = urlparse(nova.page.url).hostname or ""
                except Exception:
                    host = ""
                pwd = _password_for_host(credentials_by_host, host)
                nova.act(instruction, max_steps=12)
                maybe_type_password(nova, pwd)
                last_summary = f"Phase {plan.get('phase')}: login step with keyboard password entry attempted."
                continue

            try:
                act_result = nova.act(instruction, max_steps=18)
                meta = getattr(act_result, "metadata", None)
                steps = getattr(meta, "num_steps_executed", None) if meta else None
                last_summary = f"Phase {plan.get('phase')}: completed act ({steps or '?'} steps)."
            except Exception as e:
                last_summary = f"Act error: {e}"
                send_progress(last_summary)

        send_error("Exceeded maximum planner steps without completion")


def main() -> None:
    line = read_stdin_line()
    if not line:
        send_error("No input command")
        return
    try:
        command = json.loads(line)
    except json.JSONDecodeError as e:
        send_error(f"Invalid JSON: {e}")
        return

    action = command.get("action", "")
    if action != "apply":
        send_error(f"Unknown action: {action!r}")
        return

    try:
        run_apply(command)
    except Exception as e:
        send_error(f"Fatal: {e}")


if __name__ == "__main__":
    main()
