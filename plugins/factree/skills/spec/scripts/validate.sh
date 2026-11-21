#!/usr/bin/env bash
# Validate the structure of one or more Factree spec files.
# Usage: validate.sh <spec.md> [more.md ...]
# Prints "ERROR file:line: message" / "WARN file:line: message".
# Exit 0 if no errors, 1 if any errors, 2 on usage problems.
# Checks structure only. Whether the spec is any good is a judgment, not a script.

if [ "$#" -eq 0 ]; then
  echo "usage: validate.sh <spec.md> [more.md ...]" >&2
  exit 2
fi

status=0
for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "ERROR $file: file not found"; status=1; continue
  fi
  base=$(basename "$file" .md)
  awk -v F="$file" -v BASE="$base" '
  function err(l, m) { printf "ERROR %s:%d: %s\n", F, l, m; errors++ }
  function warn(l, m) { printf "WARN %s:%d: %s\n", F, l, m; warns++ }
  function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
  function idnum(s) { return s + 0 }
  function close_scenario() {
    if (scen == "") return
    if (!s_when) err(scen_line, req_id "." scen " has no **WHEN** step")
    if (!s_then) err(scen_line, req_id "." scen " has no **THEN** step")
    if (!s_given) warn(scen_line, req_id "." scen " has no **GIVEN** step (fine only if there is truly no precondition)")
    scen = ""
  }
  function close_requirement() {
    if (req_id == "") return
    close_scenario()
    if (!req_statement) err(req_line, req_id " has no requirement statement under its heading")
    if (req_scen_count == 0) err(req_line, req_id " has no scenarios (every requirement needs at least one)")
    req_id = ""
  }
  function check_vague(l, text, where,    lw, i, n, words) {
    lw = " " tolower(text) " "
    gsub(/[^a-z ]/, " ", lw)
    n = split(VAGUE, words, ",")
    for (i = 1; i <= n; i++) {
      if (index(lw, " " words[i] " ") > 0) {
        warn(l, where " uses the vague word \"" words[i] "\"; quantify it")
      }
    }
  }
  BEGIN {
    VAGUE = "fast,quickly,quick,large,small,many,few,scalable,robust,secure,simple,intuitive,gracefully,appropriate,appropriately,reasonable,soon,minimal,efficient,easy,user friendly,etc"
    nsec = split("Purpose,Scope,Observations,Requirements,Sketch,Code,Decisions,Open questions", CANON, ",")
    for (i = 1; i <= nsec; i++) CANON_POS[CANON[i]] = i
    fm = 0; section = ""; last_pos = 0
  }
  {
    line = $0
    # ---- front matter ----
    if (NR == 1) {
      if (line != "---") { err(1, "missing front matter (file must start with ---)"); fm = 2 }
      else { fm = 1 }
      next
    }
    if (fm == 1) {
      if (line == "---") { fm = 2; next }
      if (match(line, /^[a-z_]+:/)) {
        key = substr(line, 1, RLENGTH - 1)
        val = trim(substr(line, RLENGTH + 1))
        FM[key] = val; FM_LINE[key] = NR; cur_key = key
        if (key == "retired") {
          r = val; gsub(/[\[\] ]/, "", r)
          nr = split(r, ra, ",")
          for (i = 1; i <= nr; i++) if (ra[i] != "") RETIRED[ra[i]] = 1
        }
      } else if (cur_key == "sources" && line ~ /^[ \t]*- /) {
        sources++
      }
      next
    }
    if (fm != 2) next

    # ---- sections ----
    if (line ~ /^## /) {
      close_requirement()
      name = trim(substr(line, 4))
      section = name
      if (name in CANON_POS) {
        if (SEEN[name]) err(NR, "section \"" name "\" appears twice")
        SEEN[name] = NR
        if (CANON_POS[name] < last_pos) err(NR, "section \"" name "\" is out of order (Purpose, Scope, Observations, Requirements, Sketch, Code, Decisions, Open questions)")
        last_pos = CANON_POS[name]
      } else {
        warn(NR, "unknown section \"" name "\"")
      }
      next
    }

    if (section == "Scope" && line ~ /^\*\*Anti-goals:\*\*/) ANTI = 1   # spec-writing R2

    # The flow block in Sketch (spec-flow R1, R5): "From -> To : action [R2.S1, R2.S2]", each cited scenario must exist.
    if (section == "Sketch") {
      if (line ~ /^```flow/) { inflow = 1; next }
      if (line ~ /^```/) { inflow = 0; next }
      if (inflow && trim(line) != "") {
        if (index(line, "->") == 0) err(NR, "flow line needs \"From -> To : action\"")
        o = index(line, "["); c = index(line, "]")
        if (o > 0 && c > o) {
          ncite = split(substr(line, o + 1, c - o - 1), CITES, ",")
          for (ci = 1; ci <= ncite; ci++) { id = trim(CITES[ci]); if (id != "") FLOWCITE[id "|" NR] = 1 }
        }
      }
    }

    if (section == "Requirements") {
      if (line ~ /^### /) {
        close_requirement()
        if (line ~ /^### Requirement: R[0-9]+ [^ ]/) {
          match(line, /R[0-9]+/)
          req_id = substr(line, RSTART, RLENGTH)
          req_line = NR; req_statement = 0; req_scen_count = 0
          delete SCEN_SEEN
          if (REQ[req_id]) err(NR, "duplicate requirement id " req_id)
          REQ[req_id] = NR; nreq++
          if (RETIRED[req_id]) err(NR, req_id " is listed in retired and must not be reused")
        } else {
          err(NR, "requirement heading must be \"### Requirement: R<n> <Name>\"")
          req_id = "R?"; req_line = NR; req_statement = 1; req_scen_count = 1
        }
        next
      }
      if (line ~ /^#### /) {
        if (req_id == "") { err(NR, "scenario outside a requirement"); next }
        close_scenario()
        if (line ~ /^#### Scenario: S[0-9]+ [^ ]/) {
          match(line, /S[0-9]+/)
          scen = substr(line, RSTART, RLENGTH)
          if (SCEN_SEEN[scen]) err(NR, "duplicate scenario id " req_id "." scen)
          SCEN_SEEN[scen] = 1; SCN[req_id "." scen] = 1
        } else {
          err(NR, "scenario heading must be \"#### Scenario: S<n> <Name>\"")
          scen = "S?"
        }
        scen_line = NR; s_given = 0; s_when = 0; s_then = 0
        req_scen_count++; nscen++
        next
      }
      if (req_id == "" || trim(line) == "" || line ~ /^<!--/) next

      if (scen != "") {
        if (line ~ /^- \*\*GIVEN\*\*/) { s_given = 1 }
        else if (line ~ /^- \*\*WHEN\*\*/) { s_when = 1 }
        else if (line ~ /^- \*\*THEN\*\*/) { s_then = 1 }
        else if (line ~ /^- \*\*AND\*\*/) { }
        else { warn(NR, "unexpected line in " req_id "." scen "; steps start with - **GIVEN**/**WHEN**/**THEN**/**AND**") ; next }
        check_vague(NR, line, req_id "." scen)
        next
      }
      if (line ~ /^Source:/) {
        n = split(substr(line, 8), parts, ",")
        for (i = 1; i <= n; i++) {
          p = trim(parts[i])
          if (p ~ /^O[0-9]+$/) { OREF[p] = NR }
        }
        next
      }
      if (line ~ /^Blocked by:/) {
        rest = substr(line, 12); gsub(/ /, "", rest)
        n = split(rest, parts, ",")
        for (i = 1; i <= n; i++) if (parts[i] != "") { BLOCKREF[parts[i] "|" req_id] = NR }
        next
      }
      if (!req_statement) {
        req_statement = 1
        if (line !~ /(SHALL|MUST|SHOULD|MAY)/) err(NR, req_id " statement has no SHALL/MUST/SHOULD/MAY")
        n = gsub(/SHALL|MUST/, "&", line)
        if (n > 1) warn(NR, req_id " statement has more than one SHALL/MUST; it may be two requirements")
        check_vague(NR, line, req_id)
        next
      }
      warn(NR, "unexpected line under " req_id "; expected Source:, Blocked by: or a scenario")
      next
    }

    if (section == "Observations" && line ~ /^- /) {
      if (match(line, /^- O[0-9]+ /)) {
        id = substr(line, 3, RLENGTH - 3)
        if (OBS[id]) err(NR, "duplicate observation id " id)
        OBS[id] = NR
        if (line !~ /`[^`]+`/) warn(NR, id " has no file reference in backticks")
      } else err(NR, "observation must start \"- O<n> \"")
      next
    }

    if (section == "Decisions" && line ~ /^- /) {
      if (match(line, /^- D[0-9]+ /)) {
        id = substr(line, 3, RLENGTH - 3)
        if (DEC[id]) err(NR, "duplicate decision id " id)
        DEC[id] = NR
        if (line !~ /Superseded by/ && tolower(line) !~ /because/) warn(NR, id " does not say why (\"because ...\")")
        if (line !~ /\([0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9], [^)]+\)/) warn(NR, id " should end with (YYYY-MM-DD, who)")
        if (match(line, /Resolves Q[0-9]+/)) RESOLVES[substr(line, RSTART + 9, RLENGTH - 9)] = NR
      } else err(NR, "decision must start \"- D<n> \"")
      next
    }

    if (section == "Open questions" && line ~ /^- /) {
      if (match(line, /^- Q[0-9]+ /)) {
        id = substr(line, 3, RLENGTH - 3)
        if (QUE[id]) err(NR, "duplicate question id " id)
        QUE[id] = NR
        if (line !~ /Owner:/) warn(NR, id " has no Owner:")
        if (match(line, /Blocks:[^.]*/)) {
          rest = substr(line, RSTART + 7, RLENGTH - 7); gsub(/ /, "", rest)
          n = split(rest, parts, ",")
          for (i = 1; i <= n; i++) if (parts[i] != "") QBLOCKS[id "|" parts[i]] = NR
        }
      } else err(NR, "open question must start \"- Q<n> \"")
      next
    }
  }
  END {
    close_requirement()
    # front matter
    split("id,title,status,owner,created,updated", REQD, ",")
    for (i = 1; i <= 6; i++) if (FM[REQD[i]] == "") err(1, "front matter is missing \"" REQD[i] "\"")
    if (FM["id"] != "" && FM["id"] != BASE) err(FM_LINE["id"], "id \"" FM["id"] "\" does not match file name \"" BASE ".md\"")
    st = FM["status"]
    if (st != "" && st != "draft" && st != "approved" && st != "live") err(FM_LINE["status"], "status must be draft, approved or live")
    if (sources == 0) err(FM_LINE["sources"] ? FM_LINE["sources"] : 1, "sources is empty; record where the requirements came from")
    if ((st == "approved" || st == "live") && (FM["approved_by"] == "" || FM["approved_at"] == "")) err(FM_LINE["status"], "status is " st " but approved_by/approved_at are not set")
    # sections
    split("Purpose,Scope,Requirements,Code,Decisions,Open questions", RSEC, ",")
    for (i = 1; i <= 6; i++) if (!SEEN[RSEC[i]]) err(1, "missing section \"## " RSEC[i] "\"")
    if (SEEN["Requirements"] && nreq == 0) err(SEEN["Requirements"], "no requirements")
    if (SEEN["Scope"] && !ANTI) warn(SEEN["Scope"], "Scope has no Anti-goals line: what would make this a failure even if it works")
    # cross references
    for (k in BLOCKREF) {
      split(k, kp, "|")
      if (!QUE[kp[1]]) err(BLOCKREF[k], kp[2] " is blocked by " kp[1] ", which is not an open question")
      else if (!QBLOCKS[kp[1] "|" kp[2]]) warn(BLOCKREF[k], kp[1] " should list " kp[2] " under Blocks:")
      if (st == "approved") warn(BLOCKREF[k], "spec is approved but " kp[2] " is still blocked by " kp[1])
    }
    for (k in QBLOCKS) {
      split(k, kp, "|")
      if (!REQ[kp[2]]) err(QBLOCKS[k], kp[1] " blocks " kp[2] ", which is not a requirement")
      else if (!BLOCKREF[kp[1] "|" kp[2]]) warn(QBLOCKS[k], kp[2] " should say \"Blocked by: " kp[1] "\"")
    }
    for (q in RESOLVES) if (QUE[q]) err(QUE[q], q " is resolved by a decision but is still listed as open; delete it")
    for (k in FLOWCITE) { split(k, kp, "|"); if (!(kp[1] in SCN)) err(kp[2] + 0, "flow line cites " kp[1] ", which is not a scenario") }
    for (o in OREF) if (!OBS[o]) err(OREF[o], "Source: " o " refers to an observation that does not exist")
    printf "%s: %d requirement(s), %d scenario(s), %d error(s), %d warning(s)\n", F, nreq, nscen, errors, warns
    exit (errors > 0) ? 1 : 0
  }' "$file" || status=1
done
exit $status
