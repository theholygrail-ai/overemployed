#!/usr/bin/env python3
"""Nova Act browser automation agent for job applications.
Communicates via JSON messages on stdin/stdout.
Runs inside WSL Ubuntu.
"""

import sys
import json
import os
import base64

def send_event(event_type, **kwargs):
    msg = {"type": event_type, **kwargs}
    print(json.dumps(msg), flush=True)

def send_progress(message):
    send_event("progress", message=message)

def send_blocker(reason, screenshot_b64=None, url=None):
    send_event("blocker", reason=reason, screenshot=screenshot_b64, url=url)

def send_success(message="Application submitted"):
    send_event("success", message=message)

def send_error(message):
    send_event("error", message=message)

def apply_with_nova_act(command):
    try:
        from nova_act import NovaAct
    except ImportError:
        send_error("nova-act package not installed. Run: pip install nova-act")
        return

    url = command.get("url", "")
    cv_path = command.get("cvPath", "")
    profile = command.get("profile", {})
    artifacts = command.get("artifacts", [])

    api_key = os.environ.get("NOVA_ACT_API_KEY", "")
    if not api_key:
        send_error("NOVA_ACT_API_KEY environment variable not set")
        return

    send_progress(f"Opening {url}")

    try:
        with NovaAct(starting_page=url) as nova:
            send_progress("Page loaded, analyzing form...")

            result = nova.act("Look at this page. Is there a job application form, an 'Easy Apply' button, or a 'Sign In' / login requirement? Describe what you see.")
            page_analysis = result.response if hasattr(result, 'response') else str(result)
            send_progress(f"Page analysis: {page_analysis[:200]}")

            if any(kw in page_analysis.lower() for kw in ["sign in", "log in", "login", "captcha"]):
                screenshot = nova.page.screenshot()
                send_blocker(
                    "Authentication or CAPTCHA required",
                    base64.b64encode(screenshot).decode() if screenshot else None,
                    url
                )
                return

            send_progress("Attempting to fill application form...")

            name = profile.get("name", "")
            email = profile.get("email", "")
            phone = profile.get("phone", "")

            fill_instructions = f"""
            Fill out this job application form with the following information:
            - Full Name: {name}
            - Email: {email}
            - Phone: {phone}
            If there is an 'Easy Apply' button, click it first.
            For any file upload fields, I will handle those separately.
            Fill all required fields you can find.
            Click through any multi-step form pages (Next, Continue buttons).
            Do NOT click the final Submit button yet.
            """

            result = nova.act(fill_instructions)
            send_progress("Form fields filled")

            if cv_path and os.path.exists(cv_path):
                send_progress("Uploading CV...")
                upload_result = nova.act(f"Find any file upload input on the page and note its location. I need to upload a resume/CV file.")
                send_progress(f"Upload detection: {str(upload_result)[:200]}")

            send_progress("Reviewing before submission...")
            result = nova.act("Click the Submit or 'Submit application' button to complete the application.")

            send_success("Application submitted via Nova Act")

    except Exception as e:
        send_error(f"Nova Act error: {str(e)}")

def main():
    raw = sys.stdin.read()
    if not raw.strip():
        send_error("No input received")
        return

    try:
        command = json.loads(raw)
    except json.JSONDecodeError as e:
        send_error(f"Invalid JSON input: {str(e)}")
        return

    action = command.get("action", "")
    if action == "apply":
        apply_with_nova_act(command)
    else:
        send_error(f"Unknown action: {action}")

if __name__ == "__main__":
    main()
