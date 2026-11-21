#!/usr/bin/env bash
# Detect what kind of code lives under a directory, so skills load the right lenses.
# Usage: detect.sh [dir]     (default: current directory)
#
# Prints one block per project found (a directory with a manifest or infra files), e.g.
#   project: web
#   lenses: frontend
#   stack: angular rxjs ngrx angular-material jest playwright
#   commands: test="npm test" lint="npm run lint" e2e="npm run e2e"
#   evidence: package.json angular.json playwright.config.ts
# Lenses with a built-in file today: backend, frontend, infra. Others (mobile, data, library)
# are reported so the skill can say it is working without a lens.
# Facts only: it reads manifests and file names, never runs project code.

base="${1:-$PWD}"
base=$(cd "$base" 2>/dev/null && pwd) || { echo "no such directory: $1" >&2; exit 2; }

prune='-name node_modules -o -name .git -o -name vendor -o -name dist -o -name build -o -name .next -o -name target -o -name .venv -o -name venv -o -name __pycache__ -o -name .factree'
manifests=$(find "$base" -maxdepth 3 \( $prune \) -prune -o -type f \( \
  -name package.json -o -name Gemfile -o -name go.mod -o -name pyproject.toml -o -name requirements.txt \
  -o -name pom.xml -o -name build.gradle -o -name build.gradle.kts -o -name composer.json -o -name Cargo.toml \
  -o -name pubspec.yaml -o -name dbt_project.yml -o -name '*.tf' -o -name Chart.yaml \
  -o -name Dockerfile -o -name Jenkinsfile -o -name '*.yml' -o -name '*.yaml' \) -print 2>/dev/null)

# Kubernetes manifest: top-level apiVersion and kind, and not a Helm template (Chart.yaml beside it or one level up).
is_kube() {
  grep -q '^apiVersion:' "$1" 2>/dev/null && grep -q '^kind:' "$1" 2>/dev/null || return 1
  ! [ -f "$(dirname "$1")/Chart.yaml" ] && ! [ -f "$(dirname "$(dirname "$1")")/Chart.yaml" ]
}
# Keep only YAML that marks a project. CI files stand in for the folder holding .github or .circleci.
keep_manifests() {
  while read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      */.github/workflows/*) echo "${f%/workflows/*}" ;;
      */.circleci/config.yml) echo "${f%/config.yml}" ;;
      */Chart.yaml|*/pubspec.yaml|*/dbt_project.yml|*/.gitlab-ci.yml|*/docker-compose.yml|*/docker-compose.yaml|*/compose.yml|*/compose.yaml) echo "$f" ;;
      *.yml|*.yaml) is_kube "$f" && echo "$f" ;;
      *) echo "$f" ;;
    esac
  done
}
manifests=$(printf '%s\n' "$manifests" | keep_manifests)

# Workspace lenses (plan-verticals R12): a lens in <workspace>/lenses/ lists the files it covers under
# "## Detect" as path patterns relative to the folder being detected (* matches across /). Each lens with
# matches is reported at the deepest folder holding them all; lenses sharing a folder share a block.
lens_matches() {  # $1: patterns, one per line; stdin: relative paths
  while read -r rel; do
    [ -n "$rel" ] || continue
    while read -r pat; do
      [ -n "$pat" ] || continue
      case "$rel" in $pat) echo "$rel"; break ;; esac
    done <<EOF
$1
EOF
  done
}
common_dir() {  # stdin: relative paths → the deepest folder holding all of them
  c=""
  while read -r f; do
    d=$(dirname "$f")
    if [ -z "$c" ]; then c="$d"; continue; fi
    while [ "$c" != "." ] && [ "$d" != "$c" ]; do
      case "$d/" in "$c"/*) break ;; esac
      c=$(dirname "$c")
    done
  done
  echo "${c:-.}"
}
ws_lenses() {
  ws=$(bash "$(dirname "$0")/root.sh" "$base" 2>/dev/null) || return 0
  [ -d "$ws/lenses" ] || return 0
  all=$(find "$base" -maxdepth 6 \( $prune \) -prune -o -type f -print 2>/dev/null | while read -r f; do echo "${f#"$base"/}"; done)
  for lens in "$ws"/lenses/*.md; do
    [ -f "$lens" ] || continue
    pats=$(awk '/^## /{ d = ($0 == "## Detect") } d && /^- `/ { s = $0; sub(/^- `/, "", s); sub(/`.*$/, "", s); print s }' "$lens")
    [ -n "$pats" ] || continue
    hits=$(printf '%s\n' "$all" | lens_matches "$pats")
    [ -n "$hits" ] || continue
    printf '%s|%s|%s\n' "$(printf '%s\n' "$hits" | common_dir)" "$(basename "$lens" .md)" "$(printf '%s\n' "$hits" | head -n3 | tr '\n' ' ')"
  done | awk -F'|' '
    !($1 in names) { order[++n] = $1; names[$1] = $2; ev[$1] = $3; next }
    { names[$1] = names[$1] " " $2 }
    END { for (i = 1; i <= n; i++) { d = order[i]; sub(/ +$/, "", ev[d]); printf "project: %s\nlenses: %s\nstack: workspace-lens\ncommands:\nevidence: %s\n\n", d, names[d], ev[d] } }'
}
wsblocks=$(ws_lenses)

if [ -z "$manifests" ]; then
  [ -n "$wsblocks" ] && { printf '%s\n\n' "$wsblocks"; exit 0; }
  echo "project: ."; echo "lenses: none"; echo "stack: unknown"; echo "commands:"; echo "evidence: no manifest found"; exit 0
fi

dirs=$(printf '%s\n' "$manifests" | while read -r f; do dirname "$f"; done | sort -u)

has() { grep -q "\"$2\"[[:space:]]*:" "$1" 2>/dev/null; }          # package.json dependency
hasw() { grep -qiE "$2" "$1" 2>/dev/null; }                           # word in any manifest
script_cmd() {  # is there an npm script with this name? Works for one-line and pretty JSON.
  tr -d '\n\r' < "$1" | grep -o '"scripts"[[:space:]]*:[[:space:]]*{[^}]*}' | grep -q "\"$2\"[[:space:]]*:"
}

printf '%s\n' "$dirs" | while read -r d; do
  rel=${d#"$base"}; rel=${rel#/}; [ -z "$rel" ] && rel="."
  lenses=""; stack=""; cmds=""; evidence=""
  add() { case " $lenses " in *" $1 "*) ;; *) lenses="$lenses $1" ;; esac; }
  st() { stack="$stack $1"; }
  ev() { evidence="$evidence $1"; }

  if [ -f "$d/package.json" ]; then
    p="$d/package.json"; ev package.json
    for x in react next @angular/core vue nuxt svelte @sveltejs/kit solid-js preact lit ember-source; do
      has "$p" "$x" && { add frontend; st "${x#@}"; }
    done
    for x in express fastify koa @nestjs/core @hapi/hapi hono @apollo/server prisma knex typeorm sequelize mongoose drizzle-orm; do
      has "$p" "$x" && { add backend; st "${x#@}"; }
    done
    if has "$p" next && { [ -d "$d/app/api" ] || [ -d "$d/pages/api" ] || [ -d "$d/src/app/api" ]; }; then add backend; fi
    for x in react-native expo; do has "$p" "$x" && { add mobile; st "$x"; }; done
    for x in redux @reduxjs/toolkit @ngrx/store zustand mobx @tanstack/react-query swr rxjs @apollo/client tailwindcss styled-components @mui/material @angular/material i18next react-intl @ngx-translate/core; do
      has "$p" "$x" && st "${x#@}"
    done
    for x in jest vitest mocha karma @playwright/test cypress @testing-library/react @testing-library/angular @storybook/react @storybook/angular supertest; do
      has "$p" "$x" && st "${x#@}"
    done
    [ -f "$d/angular.json" ] && ev angular.json
    for f in next.config.js next.config.mjs next.config.ts vite.config.ts vite.config.js playwright.config.ts cypress.config.ts; do [ -f "$d/$f" ] && ev "$f"; done
    for s in test lint typecheck e2e test:e2e test:perf build; do
      script_cmd "$p" "$s" && { [ "$s" = test ] && cmds="$cmds test=\"npm test\"" || cmds="$cmds $s=\"npm run $s\""; }
    done
  fi
  if [ -f "$d/Gemfile" ]; then
    ev Gemfile
    hasw "$d/Gemfile" "['\"]rails['\"]" && { add backend; st rails; }
    hasw "$d/Gemfile" "['\"](sinatra|hanami)['\"]" && { add backend; st sinatra-or-hanami; }
    hasw "$d/Gemfile" "rspec" && { st rspec; cmds="$cmds test=\"bundle exec rspec\""; }
  fi
  for f in pyproject.toml requirements.txt; do
    [ -f "$d/$f" ] || continue
    ev "$f"
    hasw "$d/$f" "django" && { add backend; st django; }
    hasw "$d/$f" "fastapi" && { add backend; st fastapi; }
    hasw "$d/$f" "flask" && { add backend; st flask; }
    hasw "$d/$f" "(airflow|dagster|prefect)" && { add data; st orchestration; }
    hasw "$d/$f" "pytest" && { st pytest; case "$cmds" in *test=*) ;; *) cmds="$cmds test=\"pytest\"" ;; esac; }
  done
  if [ -f "$d/go.mod" ]; then
    ev go.mod; cmds="$cmds test=\"go test ./...\""
    hasw "$d/go.mod" "(gin-gonic|labstack/echo|go-chi|gorilla/mux|gofiber)" && { add backend; st go-http; }
    hasw "$d/go.mod" "grpc" && { add backend; st grpc; }
  fi
  for f in pom.xml build.gradle build.gradle.kts; do
    [ -f "$d/$f" ] || continue
    ev "$f"
    hasw "$d/$f" "spring-boot" && { add backend; st spring-boot; }
    hasw "$d/$f" "com.android" && { add mobile; st android; }
  done
  if [ -f "$d/composer.json" ]; then
    ev composer.json
    hasw "$d/composer.json" "laravel/framework" && { add backend; st laravel; }
    hasw "$d/composer.json" "symfony/framework-bundle" && { add backend; st symfony; }
  fi
  if [ -f "$d/Cargo.toml" ]; then
    ev Cargo.toml; cmds="$cmds test=\"cargo test\""
    hasw "$d/Cargo.toml" "(axum|actix-web|rocket|warp)" && { add backend; st rust-http; }
  fi
  [ -f "$d/pubspec.yaml" ] && { ev pubspec.yaml; add mobile; st flutter; }
  [ -f "$d/dbt_project.yml" ] && { ev dbt_project.yml; add data; st dbt; }
  ls "$d"/*.tf >/dev/null 2>&1 && { ev "*.tf"; add infra; st terraform; }
  [ -f "$d/Chart.yaml" ] && { ev Chart.yaml; add infra; st helm; }
  [ -f "$d/Dockerfile" ] && { ev Dockerfile; add infra; st docker; }
  for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
    [ -f "$d/$f" ] && { ev "$f"; add infra; st compose; break; }
  done
  for f in "$d"/.github/workflows/*.yml "$d"/.github/workflows/*.yaml; do
    [ -f "$f" ] && { ev .github/workflows; add infra; st github-actions; break; }
  done
  [ -f "$d/.gitlab-ci.yml" ] && { ev .gitlab-ci.yml; add infra; st gitlab-ci; }
  [ -f "$d/.circleci/config.yml" ] && { ev .circleci/config.yml; add infra; st circleci; }
  [ -f "$d/Jenkinsfile" ] && { ev Jenkinsfile; add infra; st jenkins; }
  for f in "$d"/*.yml "$d"/*.yaml; do
    [ -f "$f" ] && is_kube "$f" && { ev "$(basename "$f")"; add infra; st kubernetes; break; }
  done
  if [ -f "$d/Makefile" ]; then
    grep -qE '^test:' "$d/Makefile" && case "$cmds" in *test=*) ;; *) cmds="$cmds test=\"make test\"" ;; esac
    grep -qE '^lint:' "$d/Makefile" && case "$cmds" in *lint=*) ;; *) cmds="$cmds lint=\"make lint\"" ;; esac
  fi

  # A plain package or crate with no framework is a library.
  [ -z "$lenses" ] && [ -n "$evidence" ] && case "$evidence" in *package.json*|*Cargo.toml*|*pyproject.toml*|*go.mod*) add library ;; esac

  echo "project: $rel"
  echo "lenses:${lenses:- none}"
  echo "stack:${stack:- unknown}"
  echo "commands:$cmds"
  echo "evidence:$evidence"
  echo
done
if [ -n "$wsblocks" ]; then printf '%s\n\n' "$wsblocks"; fi
