#!/usr/bin/env python3
"""hfgate — preflight gate for Higgsfield credit-spending calls.

Nothing that spends credits may reach Higgsfield unless it was
  1. built from bible.json + a segment spec   (build)
  2. passed every lint rule                    (lint)
  3. approved with an exact params hash        (approve)
  4. confirmed by the user in chat             (confirm)
The Claude Code PreToolUse hook (hook-pre) denies any spending call whose
params hash is not a confirmed approval. Each approval is single-use.

Usage:
  hfgate.py status
  hfgate.py build   <spec-id>          # print compiled params
  hfgate.py lint    <spec-id>
  hfgate.py approve <spec-id>          # lint + record hash, prints tool_input to send verbatim
  hfgate.py confirm <spec-id> --quote "<user's words>"
  hfgate.py accept  <segment> <job-id> --quote "<user's words>"
  hfgate.py reject  <segment> <job-id> --reason "..."
  hfgate.py qa-cmd  <spec-id> <result-url> [--upstream-url URL]
  hfgate.py draft-ok <draft-spec> --quote "<user's words>"   # user approved the 480p draft
  hfgate.py balance <credits>
  hfgate.py hook-pre | hook-post       # called by Claude Code hooks (stdin JSON)
"""
import datetime
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BIBLE = os.path.join(HERE, "bible.json")
STATE = os.path.join(HERE, "state.json")
SPECS = os.path.join(HERE, "specs")
BUILD = os.path.join(HERE, "build")

# Tools that spend credits (suffix after mcp__<server>__)
SPEND_TOOLS = {
    "generate_video", "generate_video_batch", "generate_image", "generate_image_batch",
    "generate_audio", "generate_audio_batch", "generate_3d", "upscale_video", "upscale_image",
    "outpaint_image", "reframe", "remove_background", "execute_preset", "motion_control",
    "video_analysis_create", "dubbing", "voice_change", "ads_studio_generate",
    "shorts_studio_create", "animation_actions", "create_voice",
}
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(p, obj):
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, p)


def canon(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def sha(obj):
    return hashlib.sha256(canon(obj).encode("utf-8")).hexdigest()[:16]


def spec_path(sid):
    return os.path.join(SPECS, sid + ".json")


# ---------------------------------------------------------------- build
def build(sid, bible=None, state=None):
    bible = bible or load(BIBLE)
    state = state or load(STATE)
    spec = load(spec_path(sid))
    out = bible["output"]
    a = bible["assets"]
    mode = spec["mode"]

    if mode == "raw":  # verbatim params (images, utilities); still linted + approved
        return spec, dict(spec["params"]), spec.get("prompt_note", "")
    if mode == "finalize":  # 1080p finalize of an approved 480p draft: ONLY these 4 keys (E15)
        _, dparams, dprompt = build(spec["draft_spec"], bible, state)
        # use the prompt that was actually sent with the draft (bible locks may have changed since; E32)
        sent = os.path.join(HERE, "build", spec["draft_spec"] + ".tool_input.json")
        if os.path.exists(sent):
            sp = json.load(open(sent))["params"]
            dprompt, dparams = sp.get("prompt", dprompt), dict(dparams, duration=sp.get("duration", dparams.get("duration")))
        d = state.get("drafts", {}).get(spec["draft_spec"], {})
        params = {"model": out["model"], "draft_job_id": d.get("job") or "<DRAFT-NOT-GENERATED>",
                  "resolution": "1080p", "prompt": dprompt,
                  "declined_preset_id": out["declined_preset_id"]}  # get_cost verified: still 60cr (E18)
        spec = dict(spec, _draft_duration=dparams["duration"], segment=spec.get("segment"))
        return spec, params, dprompt

    medias = []
    if mode == "video_extension":
        up = state["segments"][spec["upstream"]]
        up_job = up["accepted_job"] or (up["current_job"] if spec.get("allow_candidate_upstream") else None)
        medias.append({"value": up_job or "<UPSTREAM-NOT-ACCEPTED>", "role": "video_references"})
    if spec.get("start_image"):
        medias.append({"value": a[spec["start_image"]]["id"], "role": "start_image"})
    if spec.get("end_image"):
        medias.append({"value": a[spec["end_image"]]["id"], "role": "end_image"})
    ref_keys = ["plane_sheet"]
    for loc in spec["visible"]:
        ref_keys += bible["location_refs"].get(loc, [])
    ref_keys += spec.get("extra_refs", [])
    seen = set()
    for k in ref_keys:
        if k in seen:
            continue
        seen.add(k)
        medias.append({"value": a[k]["id"], "role": "image_references"})

    L = bible["locks"]
    parts = [L["STYLE"], L["PLANE"], L["LIGHT"]]
    parts += [L[loc] for loc in spec["visible"] if loc in L]
    if mode == "video_extension":
        parts.append("Continue the reference video seamlessly from its very last frame as the SAME continuous shot: "
                     "the first frame keeps the same camera position, the same airplane position and heading, "
                     "the same location and the same light as the last frame of the reference video.")
    parts.append("START STATE: " + spec["entry_state"])
    if spec.get("untimed_beats"):  # user 2026-10-06: no fixed seconds, ordered flow with natural pacing
        parts.append("The whole flight below is ONE unbroken take in this exact order, with natural, unhurried pacing "
                     "and no fixed timing; each stage flows smoothly into the next with no cut:")
        for i, (_, _, txt) in enumerate(spec["beats"], 1):
            parts.append(f"{i}. {txt}")
    else:
        for t0, t1, txt in spec["beats"]:
            parts.append(f"{t0:g}-{t1:g}s: {txt}")
    parts.append("FINAL FRAME: " + spec["exit_state"])
    parts.append("Audio: " + spec["audio"])
    negs = bible["negatives_global"] + spec.get("extra_negatives", [])
    parts.append("Negative: " + ", ".join(negs) + ".")
    prompt = "\n".join(parts)

    params = {"model": out["model"], "mode": mode, "duration": spec["duration"],
              "resolution": out["resolution"], "generate_audio": out["generate_audio"],
              "declined_preset_id": out["declined_preset_id"], "medias": medias, "prompt": prompt}
    if mode == "video_extension":
        params["extension_mode"] = "forward"
    else:
        params["aspect_ratio"] = out["aspect_ratio"]
    if spec.get("draft"):
        params["resolution"] = "480p"
        params["draft"] = True
    return spec, params, prompt


def tool_input(params):
    return {"params": params}


def cost_of(params, bible, spec=None):
    p = bible["pricing"]
    m = params.get("model", "")
    if params.get("draft_job_id"):
        return p.get("seedance_2_5_finalize_flat", 60)
    if m.startswith("seedance"):
        rate = p["seedance_2_5_480p_draft_per_sec"] if params.get("draft") else p["seedance_2_5_1080p_per_sec"]
        return rate * float(params.get("duration", 0))
    if m == "gpt_image_2_5":
        return p["gpt_image_2_5_2k_high"] * int(params.get("count", 1))
    if m == "gpt_image_2":
        return p["gpt_image_2"]
    return float(params.get("_declared_cost", 9999))


# ---------------------------------------------------------------- lint
def lint(sid, verbose=True):
    bible, state = load(BIBLE), load(STATE)
    spec, params, prompt = build(sid, bible, state)
    E, W = [], []
    known_ids = {v["id"] for v in bible["assets"].values()}
    for s in state["segments"].values():
        known_ids |= {h["job"] for h in s["history"]}
    known_ids |= {d.get("job") for d in state.get("drafts", {}).values()}

    if spec["mode"] == "finalize":
        d = state.get("drafts", {}).get(spec["draft_spec"])
        if not d or not d.get("job"):
            E.append(f"F1 draft {spec['draft_spec']} has not been generated")
        elif d.get("status") != "user_ok":
            E.append(f"F1 draft {spec['draft_spec']} not approved by the user (status {d.get('status')}) — run draft-ok after the user confirms it")
        if set(params) != {"model", "draft_job_id", "resolution", "prompt", "declined_preset_id"}:
            E.append("F2 finalize must send only model/draft_job_id/resolution/prompt/declined_preset_id (extra keys turned it into a new 168cr generation, E15)")
    if spec["mode"] not in ("raw", "finalize"):
        seg = spec["segment"]
        bseg = bible["segments"][seg]
        out = bible["output"]
        # L1 locks present verbatim (guaranteed by build, checked anyway)
        for k in ["STYLE", "PLANE", "LIGHT"] + [v for v in spec["visible"] if v in bible["locks"]]:
            if bible["locks"][k] not in prompt:
                E.append(f"L1 lock '{k}' missing from prompt")
        # L2 every location visible in this segment (bible) is declared + referenced
        missing = set(bseg["visible"]) - set(spec["visible"])
        if missing:
            E.append(f"L2 spec.visible omits {sorted(missing)} which bible says are visible in {seg} (refs would be missing)")
        ids = [m["value"] for m in params["medias"]]
        for loc in spec["visible"]:
            for k in bible["location_refs"].get(loc, []):
                if bible["assets"][k]["id"] not in ids:
                    E.append(f"L2 visible location '{loc}' but ref '{k}' not attached")
        # L3 end_image causes forced hard cuts in a one-take (E4)
        if spec.get("end_image") and not spec.get("allow_end_image"):
            E.append("L3 end_image is forbidden for one-take segments (E4: caused hard cut at 11.9s). Set allow_end_image with reason to override.")
        # L4 upstream must be accepted (no building on candidates/stale)
        if spec["mode"] == "video_extension":
            up = state["segments"][spec["upstream"]]
            if up["status"] != "accepted":
                msg = f"L4 upstream {spec['upstream']} status is '{up['status']}', not 'accepted' (E7: downstream built on a clip that later changed)"
                (W if spec.get("allow_candidate_upstream") else E).append(msg)
            order = bible["segment_order"]
            if order.index(spec["upstream"]) != order.index(seg) - 1:
                E.append("L4 upstream is not the immediately preceding segment")
        # L5 forbidden terms in positive text
        pos = prompt.split("\nNegative:")[0].lower()
        for term, why in bible["forbidden_positive_terms"]["terms"].items():
            if term in spec.get("allow_terms", {}):
                continue
            if re.search(r"\b" + re.escape(term) + r"\b", pos):
                # allowed only inside an explicit "no ..." phrase
                hits = [m.start() for m in re.finditer(r"\b" + re.escape(term) + r"\b", pos)]
                bad = [h for h in hits if not re.search(r"\b(no|not|never|without)\b[^.;:]{0,60}$", pos[max(0, h - 80):h])]
                if bad:
                    E.append(f"L5 forbidden term '{term}' in positive prompt ({why})")
        # L6 beats contiguous 0..duration
        t = 0
        for t0, t1, _ in spec["beats"]:
            if abs(t0 - t) > 1e-6 or t1 <= t0:
                E.append(f"L6 beat timeline gap/overlap at {t0}-{t1} (expected start {t})")
            t = t1
        if abs(t - spec["duration"]) > 1e-6:
            E.append(f"L6 beats end at {t}s but duration is {spec['duration']}s")
        if spec["duration"] != bseg["seconds"]:
            W.append(f"L6 duration {spec['duration']}s differs from plan {bseg['seconds']}s (check credit plan)")
        # L7 fixed output params
        if (params["resolution"] != ("480p" if spec.get("draft") else out["resolution"])) or params["model"] != out["model"]:
            E.append("L7 model/resolution differ from bible.output")
        if not params.get("declined_preset_id"):
            E.append("L7 declined_preset_id missing (preset popup would block)")
        # L8 entry state == upstream exit state
        if spec["mode"] == "video_extension":
            ups = sorted(f for f in os.listdir(SPECS) if f.startswith(spec["upstream"] + "."))
            acc = state["segments"][spec["upstream"]].get("accepted_spec")
            src = (acc + ".json") if acc else (ups[-1] if ups else None)
            if src and os.path.exists(os.path.join(SPECS, src)):
                up_exit = load(os.path.join(SPECS, src)).get("exit_state")
                if up_exit and up_exit != spec["entry_state"]:
                    E.append(f"L8 entry_state != {src} exit_state (screen direction / position mismatch risk)")
            else:
                W.append("L8 no upstream spec on file — entry_state could not be cross-checked; verify against the upstream last frame")
        # L9 change scope vs superseded version
        sup = spec.get("supersedes")
        if sup and os.path.exists(spec_path(sup)):
            old = load(spec_path(sup))
            units = diff_units(old, spec)
            allowed = set(spec.get("change_request", {}).get("allowed_changes", []))
            extra = [u for u in units if u not in allowed]
            if extra:
                E.append(f"L9 changes outside the user's request: {extra} (allowed: {sorted(allowed)})")
            if verbose:
                print(f"   diff vs {sup}: {units or 'none'}")
        elif sup:
            W.append(f"L9 superseded spec '{sup}' not on file; scope check skipped")
        if not spec.get("change_request", {}).get("user_said"):
            E.append("L9 change_request.user_said is empty — every regeneration must quote what the user asked for")
        # L13 abrupt camera re-orientation -> Seedance inserts hard cuts (E5: v1 cut 9.25s 'swings around',
        #     SEQ2 cut 1.96s 'pivots ... to look down the corridor')
        for t0, t1, txt in spec["beats"]:
            if re.search(r"\b(swing|swings|swung|pivot|pivots|whip|whips|turns? around|spins? around|moves? backward|facing the airplane|flies toward the lens)\b", txt, re.I):
                E.append(f"L13 beat {t0:g}-{t1:g}s asks for an abrupt camera re-orientation (cut risk): '{txt[:70]}...'")
            if t1 - t0 < 2 and re.search(r"\b(quickly|suddenly|fast)\b", txt, re.I):
                E.append(f"L13 beat {t0:g}-{t1:g}s is shorter than 2s and asks for fast motion (cut risk)")
        # L10 prompt length / media count
        if len(prompt) > 3200:
            W.append(f"L10 prompt is {len(prompt)} chars (long prompts dilute instructions)")
        if len(params["medias"]) > 6:
            W.append(f"L10 {len(params['medias'])} medias attached")
    # L11 media ids known
    for m in params.get("medias", []):
        if m["value"].startswith("PENDING") or m["value"].startswith("<"):
            E.append(f"L11 media placeholder {m['value']} not yet replaced by a real, user-chosen asset")
        elif m["value"] not in known_ids:
            E.append(f"L11 unknown media id {m['value']} (typo or not registered in bible/state)")
    # L12 budget
    c = cost_of(params, bible, spec)
    bal = state["credits"]["balance"]
    plan = remaining_plan_cost(state, bible, exclude=spec.get("segment"))
    if c > bal - state["credits"]["reserve_min"]:
        E.append(f"L12 cost {c:g} exceeds balance {bal:g} minus reserve {state['credits']['reserve_min']}")
    elif c + plan > bal:
        W.append(f"L12 cost {c:g} + remaining plan {plan:g} = {c + plan:g} > balance {bal:g}: no room for a retry")

    if verbose:
        print(f"== lint {sid}  cost={c:g}cr  balance={bal:g}  params_hash={sha(tool_input(params))}")
        for e in E:
            print("  ERROR ", e)
        for w in W:
            print("  WARN  ", w)
        print("  RESULT", "PASS" if not E else f"FAIL ({len(E)} errors)")
    return spec, params, c, E, W


def diff_units(old, new):
    units = []
    for k in ["mode", "upstream", "duration", "start_image", "end_image", "audio", "entry_state", "exit_state"]:
        if old.get(k) != new.get(k):
            units.append(k)
    if sorted(old.get("visible", [])) != sorted(new.get("visible", [])):
        units.append("visible")
    if old.get("extra_refs", []) != new.get("extra_refs", []):
        units.append("extra_refs")
    if old.get("extra_negatives", []) != new.get("extra_negatives", []):
        units.append("extra_negatives")
    ob, nb = old.get("beats", []), new.get("beats", [])
    for i in range(max(len(ob), len(nb))):
        if i >= len(ob) or i >= len(nb) or ob[i] != nb[i]:
            units.append(f"beats[{i}]")
    return units


def remaining_plan_cost(state, bible, exclude=None):
    total = 0
    for seg in bible["segment_order"]:
        if seg == exclude:
            continue
        s = state["segments"][seg]
        if s["status"] in ("stale", "planned"):
            sec = bible["segments"][seg]["seconds"]
            pr = bible["pricing"]
            total += sec * (pr["seedance_2_5_480p_draft_per_sec"] + pr["seedance_2_5_finalize_per_sec"])
    return total


# ---------------------------------------------------------------- commands
def cmd_status():
    bible, state = load(BIBLE), load(STATE)
    c = state["credits"]
    print(f"credits: balance {c['balance']:g} (checked {c['balance_checked_at']}), reserve {c['reserve_min']}")
    for seg in bible["segment_order"]:
        s = state["segments"][seg]
        print(f"  {seg:5s} {s['status']:10s} current={s['current_job'] or '-'} accepted={s['accepted_job'] or '-'}")
        if s.get("note"):
            print(f"        {s['note']}")
    print(f"remaining plan (stale+planned at 1080p): {remaining_plan_cost(state, bible):g} cr")
    for k, v in state["approvals"].items():
        print(f"  approval {k}: {v['status']} hash={v['hash']} cost={v['cost']:g}")


def cmd_approve(sid):
    spec, params, c, E, W = lint(sid)
    if E:
        sys.exit("approve refused: lint errors")
    state = load(STATE)
    ti = tool_input(params)
    os.makedirs(BUILD, exist_ok=True)
    save(os.path.join(BUILD, sid + ".tool_input.json"), ti)
    state["approvals"][sid] = {"hash": sha(ti), "cost": c, "segment": spec.get("segment"),
                               "status": "awaiting_user", "warnings": W, "at": now()}
    save(STATE, state)
    print(f"\napproved (awaiting user confirmation). Send EXACTLY build/{sid}.tool_input.json")


def cmd_confirm(sid, quote):
    state = load(STATE)
    ap = state["approvals"].get(sid)
    if not ap or ap["status"] != "awaiting_user":
        sys.exit(f"{sid}: no approval awaiting user")
    if not quote:
        sys.exit("--quote with the user's own confirming words is required")
    ap.update(status="confirmed", user_quote=quote, confirmed_at=now())
    save(STATE, state)
    print(f"{sid} confirmed — the hook will allow exactly one call with hash {ap['hash']}")


def mark_downstream_stale(state, bible, seg):
    order = bible["segment_order"]
    for later in order[order.index(seg) + 1:]:
        s = state["segments"][later]
        if s["status"] in ("accepted", "candidate", "generated"):
            s["status"] = "stale"
            s["note"] = (s.get("note", "") + f" | STALE: upstream {seg} changed {now()}").strip(" |")


def cmd_accept(seg, job, quote):
    if not quote:
        sys.exit("--quote with the user's acceptance words is required")
    bible, state = load(BIBLE), load(STATE)
    s = state["segments"][seg]
    prev = s["accepted_job"]
    s.update(status="accepted", accepted_job=job, current_job=job, accepted_quote=quote, accepted_at=now())
    for h in s["history"]:
        if h["job"] == job:
            h["verdict"] = "accepted"
            s["accepted_spec"] = h.get("spec")
    if prev != job:
        mark_downstream_stale(state, bible, seg)
    save(STATE, state)
    print(f"{seg} accepted = {job}; downstream marked stale where needed")


def cmd_reject(seg, job, reason):
    state = load(STATE)
    for h in state["segments"][seg]["history"]:
        if h["job"] == job:
            h["verdict"] = "rejected: " + reason
    save(STATE, state)
    print("recorded")


def cmd_qa(sid, url, upstream_url):
    bible = load(BIBLE)
    spec = load(spec_path(sid)) if os.path.exists(spec_path(sid)) else {"visible": []}
    refs = []
    for loc in spec.get("visible", []):
        for k in bible["location_refs"].get(loc, []):
            refs.append(k)
    print(QA_TEMPLATE.replace("__URL__", url).replace("__UP__", upstream_url or "")
          .replace("__REFS__", " ".join(refs)).replace("__DUR__", str(spec.get("duration", 0))))



QA_TEMPLATE = r"""# --- hfgate QA (run in Higgsfield sandbox_exec, background if > 60s) ---
cd /home/user && rm -rf qa && mkdir qa && cd qa
curl -sf -o new.mp4 '__URL__' || { echo DOWNLOAD_FAIL; exit 1; }
UP='__UP__'; [ -n "$UP" ] && curl -sf -o up.mp4 "$UP"
echo "== probe"; ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration -of compact new.mp4
echo "== hard cuts (scene>0.25 => FAIL)"
ffmpeg -v error -i new.mp4 -vf "scale=320:-2,select='gte(scene,0)',metadata=print:file=sc.txt" -an -f null -
paste -d' ' <(grep -o 'pts_time:[0-9.]*' sc.txt) <(grep -o 'scene_score=[0-9.]*' sc.txt) | sort -t= -k2 -nr | head -5
python3 - <<'EOF'
import re,subprocess,os,json
import numpy as np
from PIL import Image
s=[float(x) for x in re.findall(r'scene_score=([0-9.]+)',open('sc.txt').read())]
res={"max_scene":max(s) if s else 0,"cuts":sum(1 for x in s if x>0.25)}
def fr(src,t,out):
    subprocess.run(["ffmpeg","-v","error","-y"]+(["-sseof",str(t)] if t<0 else ["-ss",str(t)])+["-i",src,"-frames:v","1","-vf","scale=160:90",out],check=True)
    return np.asarray(Image.open(out).convert('RGB'),float)
def cmp(a,b):
    return {"lumaCorr":round(float(np.corrcoef(a.mean(2).ravel(),b.mean(2).ravel())[0,1]),2),"MAD":round(float(np.abs(a-b).mean()),1)}
if os.path.exists('up.mp4'):
    res["seam"]=cmp(fr('up.mp4',-0.2,'u.png'),fr('new.mp4',0.0,'n.png'))
    res["seam_pass"]=res["seam"]["lumaCorr"]>=0.45 and res["seam"]["MAD"]<=32
res["pass_cuts"]=res["cuts"]==0
print("QA_JSON",json.dumps(res))
EOF
"""


# ---------------------------------------------------------------- hooks
def _short(name):
    return name.split("__")[-1] if name.startswith("mcp__") else name


def _is_free_probe(ti):
    reqs = ti.get("requests") or [ti]
    return all((r.get("params") or {}).get("get_cost") is True for r in reqs)


def deny(msg):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": "deny",
                                             "permissionDecisionReason": msg}}, ensure_ascii=False))
    sys.exit(0)


def hook_pre():
    ev = json.load(sys.stdin)
    name, ti = ev.get("tool_name", ""), ev.get("tool_input") or {}
    short = _short(name)
    if short == "balance" and os.path.exists(os.path.join(HERE, ".selftest")):
        deny("HFGATE SELFTEST OK — hook is live (remove harness/.selftest)")
    if short not in SPEND_TOOLS:
        sys.exit(0)
    if _is_free_probe(ti):
        sys.exit(0)
    state = load(STATE)
    h = sha(ti)
    # an identical retry (e.g. after a no-charge failure) has the same hash as the used approval:
    # check confirmed approvals first so the fresh one wins
    items = sorted(state["approvals"].items(), key=lambda kv: kv[1]["status"] != "confirmed")
    for sid, ap in items:
        if ap["hash"] == h:
            if ap["status"] == "awaiting_user":
                deny(f"HFGATE: {sid} is approved by lint but NOT confirmed by the user. Show the user the cost/diff, get an explicit OK, then run: hfgate.py confirm {sid} --quote '<their words>'")
            if ap["status"] != "confirmed":
                deny(f"HFGATE: approval {sid} was already used (status '{ap['status']}'). Approvals are single-use: re-run approve + confirm for a retry.")
            bal = state["credits"]["balance"]
            if ap["cost"] > bal - state["credits"]["reserve_min"]:
                deny(f"HFGATE: cost {ap['cost']} exceeds balance {bal} - reserve")
            ap.update(status="submitted", submitted_at=now())
            save(STATE, state)
            sys.exit(0)
    pending = [f"{k}({v['status']},{v['hash']})" for k, v in state["approvals"].items() if v["status"] in ("confirmed", "awaiting_user")]
    deny("HFGATE: this credit-spending call is not an approved spec (params hash " + h + "). "
         "Build it with hfgate.py build/lint/approve, get user confirmation, and send build/<spec>.tool_input.json verbatim. "
         f"Pending approvals: {pending or 'none'}")


def hook_post():
    ev = json.load(sys.stdin)
    name, ti = ev.get("tool_name", ""), ev.get("tool_input") or {}
    if _short(name) not in SPEND_TOOLS or _is_free_probe(ti):
        sys.exit(0)
    state = load(STATE)
    h = sha(ti)
    resp = json.dumps(ev.get("tool_response", ""), ensure_ascii=False)
    m = re.search(r'"id\W+(' + UUID + r')\W+type\W+(video|image|audio)', resp) or re.search(r'job_id\W+(' + UUID + ')', resp)
    job = m.group(1) if m else None
    if job is None or "preset_recommendation" in resp:
        # nothing was submitted (e.g. preset pop-up, error): give the approval back, charge nothing (E18)
        for sid, ap in state["approvals"].items():
            if ap["hash"] == h and ap["status"] == "submitted":
                ap.update(status="confirmed", note="previous call submitted nothing: " + resp[:120])
                save(STATE, state)
        sys.exit(0)
    for sid, ap in state["approvals"].items():
        if ap["hash"] == h and ap["status"] == "submitted":
            ap.update(status="spent", job=job)
            state["credits"]["balance"] = round(state["credits"]["balance"] - ap["cost"], 2)
            seg = ap.get("segment")
            if ti.get("params", {}).get("draft"):
                state.setdefault("drafts", {})[sid] = {"job": job, "status": "awaiting_user_review", "at": now()}
            if seg and seg in state["segments"]:
                s = state["segments"][seg]
                s["status"], s["current_job"] = "generated", job
                s["history"].append({"job": job, "spec": sid, "cost": ap["cost"], "verdict": "awaiting QA + user review"})
            state["ledger"].append({"at": now(), "spec": sid, "job": job, "cost": ap["cost"]})
            save(STATE, state)
            break
    sys.exit(0)


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    c = a[0]

    def opt(flag):
        return a[a.index(flag) + 1] if flag in a else None
    if c == "status":
        cmd_status()
    elif c == "build":
        _, params, prompt = build(a[1])
        print(json.dumps(tool_input(params), ensure_ascii=False, indent=1))
    elif c == "lint":
        _, _, _, E, _ = lint(a[1])
        sys.exit(1 if E else 0)
    elif c == "approve":
        cmd_approve(a[1])
    elif c == "confirm":
        cmd_confirm(a[1], opt("--quote"))
    elif c == "accept":
        cmd_accept(a[1], a[2], opt("--quote"))
    elif c == "reject":
        cmd_reject(a[1], a[2], opt("--reason") or "")
    elif c == "qa-cmd":
        cmd_qa(a[1], a[2], opt("--upstream-url"))
    elif c == "draft-ok":
        st = load(STATE)
        d = st.setdefault("drafts", {}).get(a[1])
        if not d or not opt("--quote"):
            sys.exit("unknown draft or missing --quote")
        d.update(status="user_ok", user_quote=opt("--quote"), ok_at=now())
        save(STATE, st)
        print(f"{a[1]} draft approved by user")
    elif c == "balance":
        st = load(STATE)
        st["credits"].update(balance=float(a[1]), balance_checked_at=now())
        save(STATE, st)
        print("ok")
    elif c == "hook-pre":
        hook_pre()
    elif c == "hook-post":
        hook_post()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
