# Professor Slides Skills

A Claude Code plugin that plans a presentation, writes it, and renders it —
over a course it finds rather than one it assumes.

A spin-off of `/make-materials` from the [AINAR Professor
Exoskeleton](../../ProfessorHarness), which does the same job welded to that
repository: it needs the `ainar` CLI on PATH, a `courses/` tree in a particular
layout, `ainar approve` to promote a draft, and `Document` records to carry the
render contract. A professor who only wants to build a deck cannot use it.
This installs on its own — three skills, a `pres` CLI, no other repository
required.

## Install from claude.ai — all buttons

The shortest route has no file editing and no terminal in it. In the Claude web
app or the desktop app, open **Settings → Customize → Plugins**, then:

1. **Add** (top right) → **Add marketplace**.
2. Paste `ardakshalkar/professor-slides-skills` into **URL** — the field takes
   a GitHub `owner/repo` or a full git repository URL.
3. **Sync**.
4. The plugin appears under **Plugins**. Turn it on there.

This is the account-level route: what you enable here syncs through your
claude.ai account and is what **Cowork** and cloud sessions read. It is *not*
the same store as the `~/.claude` directory that a local **Code** session or a
terminal `claude` reads — so for the plugin to appear in local coding sessions,
use one of the two routes below as well.

## Install in the Claude desktop app

Local **Code** sessions have their own plugin store, separate from the
account-level one above. It installs with buttons too — the **+** next to the
prompt box, then **Plugins** — with one catch worth stating plainly: *that*
browser only lists marketplaces already registered, and unlike the claude.ai
panel it has no button to add one. This repository is not registered until you
say so, and the slash commands most instructions give you (`/plugin`) are
**terminal-only** — they do nothing in the desktop app.

So the honest desktop route is one small file, then buttons.

**Step 1 — register the marketplace.** Ask Claude, in the Code tab, to do it
for you:

> Add `ardakshalkar/professor-slides-skills` as a plugin marketplace named
> `professor-exoskeleton` in my user settings.

Or write it yourself, in `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "professor-exoskeleton": {
      "source": {
        "source": "git",
        "url": "https://github.com/ardakshalkar/professor-slides-skills.git"
      }
    }
  },
  "enabledPlugins": {
    "professor-slides-skills@professor-exoskeleton": true
  }
}
```

Use `~/.claude/settings.json` to have it everywhere, or a project's
`.claude/settings.json` to share it with everyone on one repository. A project
file takes effect once you have trusted that folder. `{"source": "github",
"repo": "ardakshalkar/professor-slides-skills"}` is an equivalent shorthand if
you prefer it.

Adding `enabledPlugins` as well, as above, turns the plugin on the moment the
marketplace resolves, and you can skip step 2 entirely.

**Step 2 — install it, with buttons.** Start a session, then **+** →
**Plugins** → **Add plugin**. **professor-slides-skills** is now in the
browser. Open it, check the **Will install** list — three skills and one
`SessionStart` hook, no MCP server and no agents — and install. **Manage
plugins** in the same menu enables, disables and uninstalls it later.
**Customize** in the sidebar collects connectors, skills and plugins in one
place.

**Step 3 — let it install its dependencies.** Installing a plugin does not run
`npm install`, so the first `pres` command would die on a missing module. The
plugin notices this itself and prints the exact command at the start of your
next session, because it lives in Claude's plugin cache and the path is not one
you could guess:

```text
professor-slides-skills: dependencies are not installed, so every `pres`
command will fail on the first import. One command fixes it:
    cd "~/.claude/plugins/cache/professor-exoskeleton/professor-slides-skills/0.2.0/node" && npm install
```

You do not need a terminal for this either — paste that line to Claude and ask
it to run it. If you would rather do it yourself, the desktop app has a
terminal under the **Views** menu, or **Ctrl+`**.

Silence at the start of a session means everything is there. If only
`pptxgenjs`, `sharp` or `pg` failed to build, the message says so and says what
that costs — those three are optional, and reading and checking a course works
without them.

## Install from the terminal

If you run `claude` in a terminal, the whole thing is two commands and a panel:

```bash
/plugin marketplace add ardakshalkar/professor-slides-skills
```

```bash
/plugin
```

`/plugin` opens a tabbed panel — **Discover**, **Installed**, **Marketplaces**,
**Errors**, moved through with **Tab**. On **Discover**, select
**professor-slides-skills** and press **Enter**: the details pane shows its
**Context cost**, its **Last updated** date and the **Will install** inventory.
Pick a scope — **User** for every project, **Project** for everyone on the
repository, **Local** for you here only. If the summary says `Run
/reload-plugins to activate.`, run it.

`/plugin install professor-slides-skills@professor-exoskeleton` skips straight
to the scope choice. Then run the `npm install` line from step 3 above.

## Or as loose skills

Without the marketplace: copy the three folders in
`plugin/professor-slides-skills/skills/` into `~/.claude/skills/`, and
`npm link` in `node/` to get a global `pres`. Either route, and what each
buys you, is in [the plugin's README](plugin/professor-slides-skills/README.md).

Not distributed as a claude.ai desktop MCPB extension — this is a
skills-and-CLI plugin, with no MCP server in it.

## Install in Codex and ChatGPT — not yet

[ChatGPT and Codex share one plugin
directory](https://developers.openai.com/plugins/concepts/plugins), so there is
no separate "ChatGPT plugin" to build: the same
[`.codex-plugin/plugin.json`](plugin/professor-slides-skills/.codex-plugin/plugin.json)
that Codex reads is what puts a plugin in front of ChatGPT users too. This
repository carries that manifest alongside the Claude one.

The flow it is meant to reach is the same shape as Claude's. In Codex CLI,
`/plugins` opens a browser with marketplace tabs across the top — search it,
press **Enter** for details, choose **Install plugin**, and **Space** toggles
an installed plugin on and off. Plugins run in ChatGPT web, desktop and mobile,
in Codex inside the ChatGPT desktop app, and in Codex CLI; the **IDE extension
does not support them**.

The pieces that make it *reachable* are in place. There is a Codex marketplace
at [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json), so
in principle:

```bash
codex plugin marketplace add ardakshalkar/professor-slides-skills
```

**But it has never been run under Codex, and one known problem remains.** The
hook and both skill files locate `references/`, `beats/` and the worked example
through `${CLAUDE_PLUGIN_ROOT}`, a variable only Claude Code sets. Under Codex
those paths collapse to the filesystem root, so the skills lose their reference
material and [the preflight
hook](plugin/professor-slides-skills/hooks/hooks.json) fails into a misleading
message about Node. Fixing that means a variable both loaders set, or a
lookup that does not need one — and it is not done.

There is a second, more structural limit: these three skills are a thin layer
over the `pres` command, so they need a shell. Codex CLI has one. ChatGPT web
and mobile do not, and nothing here will work there whatever the manifest says.

So: **Claude Code is the tested path.** Codex is plumbed but unproven — try it
if you like, and check the skills actually find their references before
trusting a deck to it.

## What's inside

Everything — the three skills, the `pres` CLI, where the course comes from,
and what is enforced rather than trusted — is in
[the plugin's README](plugin/professor-slides-skills/README.md).
[`RULES.md`](plugin/professor-slides-skills/RULES.md) has the reasoning behind each
refusal, and [`examples/`](plugin/professor-slides-skills/examples) has one complete
worked set: an outline, a deck, a figure and the plan that ties them together.

## Layout

```text
.claude-plugin/marketplace.json          install from this repository
.agents/plugins/marketplace.json         the same, for Codex (untested)
plugin/professor-slides-skills/
  .codex-plugin/                         the Codex/ChatGPT manifest (untested)
  skills/                                the three skills, with their templates
  beats/                                 29 teaching beats — the planning unit
  references/                            deck grammars, teaching beats, visual
                                         grammar, course sources, figures
  preferences/defaults.yaml              what a deck looks like when nobody said
  examples/MODULE-06/                    a complete worked set
  node/                                  the `pres` CLI and its tests
  bin/pres, bin/pres.cmd                 the shim that puts `pres` on PATH
work/                                    drafts (gitignored)
output/                                  renders (gitignored)
```

Planning runs down three taxonomies rather than jumping from a section to a list
of slides — **deck grammar → teaching beat → slide intent → visual archetype** —
because a generator that skips that produces *title and three bullets*, fifteen
times, with every slide individually defensible.

## Requirements

Node 22.6 or later — the plugin runs its TypeScript directly. `pptxgenjs` and
`sharp` are optional and only `pres render` needs them; LibreOffice is needed
only for the PDF. Reading and checking a course needs none of the three.

## Part of Professor Exoskeleton

This plugin is one piece of a larger agentic harness for university teaching —
**Professor Exoskeleton** — that also covers course setup, term planning,
grading, gap analysis, dashboards and student reports over the same course
model. This repository is the part of it that stands alone.

## Author

**Ardak Shalkarbayuly**

- LinkedIn: [linkedin.com/in/ardak-shalkarbayuli-41487539](https://www.linkedin.com/in/ardak-shalkarbayuli-41487539/)
- Telegram: [@ardakshalkar](https://t.me/ardakshalkar)

## Licence

MIT — see [LICENSE](LICENSE).
