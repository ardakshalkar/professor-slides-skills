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

## Install in the Claude desktop app

**This is the tested route.** It is what the plugin was installed with while
this README was written, and it works today.

Local **Code** sessions keep their own plugin store, and the desktop app
installs into it with buttons — the **+** next to the prompt box, then
**Plugins**. One catch, worth stating plainly: that browser only lists
marketplaces already registered, and it has no button to add one. Nor can you
type your way around it — `/plugin`, which most instructions hand you, is
**terminal-only** and does nothing in the desktop app.

So: register the marketplace once, then use the buttons.

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
plugins** in the same menu enables, disables and uninstalls it later. Ignore
**Customize** in the sidebar for this: it is the account-level store, and it
cannot take this plugin yet.

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

## Install from claude.ai — does not work yet

There is an all-buttons route, and it is the one you would reach for first:
**Settings → Customize → Plugins → Add → Add marketplace**, a field taking a
GitHub `owner/repo` or a git URL, a **Sync automatically** switch, **Sync**.

It refuses this repository. Both spellings of the address —
`ardakshalkar/professor-slides-skills` and the full `.git` URL — come back with:

```text
Marketplace sync failed. Check the repository URL and try again.
```

Nothing is wrong with the URL, or with this repository. That panel's backend
does not support third-party marketplaces at all: it rejects every documented
plugin source type from a non-Anthropic marketplace, and a relative path like
this one's `./plugin/professor-slides-skills` fails server-side with *no files
found at source path*. See
[anthropics/claude-code#41653](https://github.com/anthropics/claude-code/issues/41653),
closed as not planned, and
[#61271](https://github.com/anthropics/claude-code/issues/61271) for the same
generic message wrapping a different backend failure. There is no repository
change that fixes it, which is why nothing here tries.

The routes above work because they read the marketplace locally rather than
through that backend.

Worth knowing regardless: this is the **account-level** store. What you enable
here syncs through your claude.ai account and feeds **Cowork** and cloud
sessions. It is *not* the `~/.claude` directory a local **Code** session or a
terminal `claude` reads, and neither store fills the other. So the only thing
this costs you today is Cowork and cloud sessions; local sessions are covered.

## Install in Codex

Codex has its own marketplace file, and this repository carries one at
[`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) beside
the Claude one.

In the Codex app, open **Plugins** and choose **Add plugin marketplace**. Put
the repository into **Source**:

```text
https://github.com/ardakshalkar/professor-slides-skills
```

Leave **Git ref** and **Sparse paths** empty. The greyed-out `main` and
`plugins/codex` are examples rather than defaults: Codex resolves this
repository's default branch on its own, and the marketplace entry already names
where the plugin sits. Then **Add marketplace**.

From Codex CLI, `/plugins` opens the same browser — marketplace tabs across the
top, **Enter** for details, **Install plugin**, **Space** to toggle an
installed plugin. Or skip the browser:

```bash
codex plugin marketplace add ardakshalkar/professor-slides-skills
```

### How far this is known to work

Codex clones the repository, finds the marketplace file and parses it — its
own error messages proved each of those, one rejected field at a time. What has
**not** been seen is a finished install, or a skill running.

One known problem stands in the way. The hook and both skill files locate
`references/`, `beats/` and the worked example through `${CLAUDE_PLUGIN_ROOT}`,
which only Claude Code sets. Under Codex those paths collapse to the filesystem
root, so the skills lose their reference material and [the preflight
hook](plugin/professor-slides-skills/hooks/hooks.json) fails into a misleading
message about Node. That wants a lookup needing no such variable, and it is not
written yet.

A second limit is structural rather than a bug: these three skills are a thin
layer over the `pres` command, so they need a shell. Codex CLI has one.

So **Claude Code is the tested path**, and Codex is plumbed but unproven. If you
try it, check that a skill can actually read its references before trusting a
deck to it.

## ChatGPT

[ChatGPT and Codex share one plugin
directory](https://developers.openai.com/plugins/concepts/plugins), so there is
no separate "ChatGPT plugin" to build — but nothing here reaches ChatGPT today.
`chatgpt.com/plugins` lists curated connectors with no field for a repository,
and `chatgpt.com/skills` offers only *create in chat*, *create in editor* and
*upload from computer*: no marketplace, no sync. Even uploading a `SKILL.md` by
hand would not help, because ChatGPT on the web has no shell to run `pres` in.

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
