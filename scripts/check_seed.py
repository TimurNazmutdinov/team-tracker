#!/usr/bin/env python3
"""Проверяет data/seed.json: ссылки, иерархию, points, спринты и историю.

Правила: ADR-003 (docs/adr/003-business-rules.md), в первую очередь
- п. 6: Epic -> Story | Task | Bug -> Sub-task; points только у Story/Task/Bug;
- п. 9: Sub-task в том же спринте, что и родитель.
Запуск: python3 scripts/check_seed.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TYPES = {"Epic", "Story", "Task", "Bug", "Sub-task"}
STATUSES = ["Backlog", "To Do", "In Progress", "Review", "Done"]
PRIORITIES = {"Highest", "High", "Medium", "Low"}
SPRINT_STATES = {"planned", "active", "closed"}
LINK_TYPES = {"blocks", "relates", "duplicates"}
PROJECT_ROLES = {"product", "lead", "developer"}
WIP_COLUMNS = {"To Do", "In Progress", "Review", "Done"}
FIELDS = {
    "created", "status", "assigneeId", "points", "sprintId",
    "title", "description", "acceptance", "priority", "parentId", "labels", "dueDate",
}
ESTIMATED = {"Story", "Task", "Bug"}

errors = []


def err(msg):
    errors.append(msg)


def main():
    seed = json.loads((ROOT / "data" / "seed.json").read_text(encoding="utf-8"))
    if not isinstance(seed.get("version"), int) or isinstance(seed.get("version"), bool) or seed["version"] < 1:
        err("version: ожидается целое число >= 1 (при изменении seed его нужно увеличить)")
    seed = {k: v for k, v in seed.items() if k != "version"}
    seed.setdefault("members", [])
    seed.setdefault("templates", [])
    ids = {k: {x["id"] for x in seed[k]} for k in seed}
    for k, v in seed.items():
        if len(ids[k]) != len(v):
            err(f"{k}: повторяющиеся id")

    def ref(value, coll, where, nullable=False):
        if value is None:
            if not nullable:
                err(f"{where}: пустая ссылка на {coll}")
        elif value not in ids[coll]:
            err(f"{where}: нет {coll} с id {value}")

    issues = {i["id"]: i for i in seed["issues"]}
    sprints = {s["id"]: s for s in seed["sprints"]}

    # --- ссылки и справочники
    for pr in seed["projects"]:
        w = f"project {pr['id']}"
        dur, num = pr.get("sprintDurationDays"), pr.get("nextSprintNumber")
        if not isinstance(dur, int) or not 1 <= dur <= 90:
            err(f"{w}: sprintDurationDays должен быть целым 1–90")
        if not isinstance(num, int) or num < 1:
            err(f"{w}: nextSprintNumber должен быть целым >= 1")
        if not isinstance(pr.get("sprintPrefix"), str) or not pr["sprintPrefix"]:
            err(f"{w}: sprintPrefix не может быть пустым")
        if pr.get("nextSprintStart") is not None and not isinstance(pr["nextSprintStart"], str):
            err(f"{w}: nextSprintStart — дата или null")
        ref(pr.get("ownerId"), "people", w + " (ownerId)", True)
        if not isinstance(pr.get("wipEnabled", False), bool):
            err(f"{w}: wipEnabled — true или false")
        for col, lim in (pr.get("wipLimits") or {}).items():
            if col not in WIP_COLUMNS:
                err(f"{w}: WIP-лимит для неизвестной колонки {col}")
            elif not isinstance(lim, int) or isinstance(lim, bool) or not 1 <= lim <= 999:
                err(f"{w}: WIP-лимит колонки {col} — целое 1–999")
    seen_names = set()
    for tpl in seed.get("templates", []):
        w = f"template {tpl['id']}"
        ref(tpl["projectId"], "projects", w)
        if tpl["type"] not in TYPES or tpl["type"] == "Epic":
            err(f"{w}: тип {tpl['type']}")
        if not tpl["name"].strip() or len(tpl["name"]) > 60:
            err(f"{w}: название 1–60 символов")
        key = (tpl["projectId"], tpl["name"].lower())
        if key in seen_names:
            err(f"{w}: название шаблона повторяется в проекте")
        seen_names.add(key)
    seen_members = set()
    for m in seed.get("members", []):
        w = f"member {m['id']}"
        ref(m["projectId"], "projects", w)
        ref(m["personId"], "people", w)
        if m["role"] not in PROJECT_ROLES:
            err(f"{w}: роль {m['role']}")
        key = (m["projectId"], m["personId"])
        if key in seen_members:
            err(f"{w}: человек уже участник проекта")
        seen_members.add(key)
        owner = next((p.get("ownerId") for p in seed["projects"] if p["id"] == m["projectId"]), None)
        if owner == m["personId"]:
            err(f"{w}: владелец проекта не должен повторяться среди участников")
    for s in seed["sprints"]:
        w = f"sprint {s['id']}"
        ref(s["projectId"], "projects", w)
        if s["state"] not in SPRINT_STATES:
            err(f"{w}: состояние {s['state']}")
        if (s["state"] == "closed") != bool(s.get("closedAt")):
            err(f"{w}: closedAt должен быть задан ровно у закрытого спринта")
        if s["end"] < s["start"]:
            err(f"{w}: конец раньше начала")
    for p in {s["projectId"] for s in seed["sprints"]}:
        n = sum(1 for s in seed["sprints"] if s["projectId"] == p and s["state"] == "active")
        if n > 1:
            err(f"project {p}: активных спринтов {n}")
    numbers = set()
    for i in issues.values():
        w = f"issue {i['id']}"
        ref(i["projectId"], "projects", w)
        ref(i["assigneeId"], "people", w, True)
        ref(i["reporterId"], "people", w)
        ref(i["parentId"], "issues", w, True)
        ref(i["sprintId"], "sprints", w, True)
        if i["type"] not in TYPES:
            err(f"{w}: тип {i['type']}")
        if i["status"] not in STATUSES:
            err(f"{w}: статус {i['status']}")
        if i["priority"] not in PRIORITIES:
            err(f"{w}: приоритет {i['priority']}")
        key = (i["projectId"], i["number"])
        if key in numbers:
            err(f"{w}: повторяющийся номер {i['number']}")
        numbers.add(key)
    seen = set()
    for l in seed["links"]:
        w = f"link {l['id']}"
        ref(l["fromId"], "issues", w)
        ref(l["toId"], "issues", w)
        if l["type"] not in LINK_TYPES:
            err(f"{w}: тип {l['type']}")
        if l["fromId"] == l["toId"]:
            err(f"{w}: связь с самой собой")
        if (l["fromId"], l["toId"], l["type"]) in seen:
            err(f"{w}: повтор связи")
        seen.add((l["fromId"], l["toId"], l["type"]))
    for c in seed["comments"]:
        ref(c["issueId"], "issues", f"comment {c['id']}")
        ref(c["authorId"], "people", f"comment {c['id']}")
    for h in seed["history"]:
        w = f"history {h['id']}"
        ref(h["issueId"], "issues", w)
        ref(h["authorId"], "people", w)
        if h["field"] not in FIELDS:
            err(f"{w}: поле {h['field']}")

    # --- правило 6: иерархия и points
    for i in issues.values():
        w = f"{i['id']} ({i['type']})"
        parent = issues.get(i["parentId"]) if i["parentId"] else None
        ptype = parent["type"] if parent else None
        if i["type"] == "Epic" and parent:
            err(f"{w}: у Epic не может быть родителя")
        if i["type"] in ESTIMATED and ptype not in (None, "Epic"):
            err(f"{w}: родитель {parent['id']} типа {ptype}; допустим только Epic")
        if i["type"] == "Sub-task" and ptype not in ESTIMATED:
            err(f"{w}: Sub-task вкладывается только в Story, Task или Bug (родитель: {ptype})")
        pts = i["points"]
        if i["type"] in ESTIMATED:
            if pts is not None and (not isinstance(pts, int) or isinstance(pts, bool) or pts < 0):
                err(f"{w}: points должен быть целым >= 0, а не {pts!r}")
        elif pts is not None:
            err(f"{w}: у {i['type']} points не ставятся (сейчас {pts})")

    # --- правило 9: Sub-task в спринте родителя
    for i in issues.values():
        if i["type"] == "Sub-task" and i["parentId"] in issues:
            if i["sprintId"] != issues[i["parentId"]]["sprintId"]:
                err(f"{i['id']}: Sub-task в спринте {i['sprintId']}, родитель {i['parentId']} в {issues[i['parentId']]['sprintId']}")

    # --- история: воспроизведение и заморозка закрытых спринтов
    state = {}
    for h in sorted(seed["history"], key=lambda h: (h["at"], int(h["id"][1:]))):
        w = f"history {h['id']}"
        st = state.setdefault(h["issueId"], {"created": False, "status": None, "sprintId": None})
        if h["field"] == "created":
            if st["created"]:
                err(f"{w}: второе событие created у {h['issueId']}")
            st.update(created=True, status=h["to"])
            continue
        if not st["created"]:
            err(f"{w}: событие до created у {h['issueId']}")
        cur = st["sprintId"]
        if cur and sprints[cur].get("closedAt") and h["at"] > sprints[cur]["closedAt"]:
            err(f"{w}: изменение {h['field']} задачи {h['issueId']} в закрытом спринте {cur} после closedAt")
        if h["field"] in ("status", "sprintId") and st[h["field"]] != h["from"]:
            err(f"{w}: from={h['from']!r}, а было {st[h['field']]!r}")
        if h["field"] in ("status", "sprintId"):
            st[h["field"]] = h["to"]
    for i in issues.values():
        st = state.get(i["id"])
        if not st or not st["created"]:
            err(f"{i['id']}: нет события created")
            continue
        if st["status"] != i["status"]:
            err(f"{i['id']}: по истории статус {st['status']}, в задаче {i['status']}")
        if st["sprintId"] != i["sprintId"]:
            err(f"{i['id']}: по истории спринт {st['sprintId']}, в задаче {i['sprintId']}")
        first = [h for h in seed["history"] if h["issueId"] == i["id"] and h["field"] == "created"]
        if first and first[0]["at"] != i["createdAt"]:
            err(f"{i['id']}: created в истории не совпадает с createdAt")

    if errors:
        print("ОШИБКИ:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    by_type = {}
    for i in issues.values():
        by_type[i["type"]] = by_type.get(i["type"], 0) + 1
    print(f"задач: {len(issues)} ({', '.join(f'{k}: {v}' for k, v in sorted(by_type.items()))})")
    print(f"спринтов: {len(sprints)}, связей: {len(seed['links'])}, комментариев: {len(seed['comments'])}, записей истории: {len(seed['history'])}")
    print("правило 6 (иерархия, points): OK")
    print("правило 9 (Sub-task в спринте родителя): OK")
    print("ссылочная целостность, история, closedAt: OK")
    print("OK")


if __name__ == "__main__":
    main()
