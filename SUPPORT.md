# Getting help

AI Tab Grouper is maintained by one person in their spare time, so please use the channel that fits your question:

| You want to… | Go to |
|---|---|
| Ask how to install, configure or use the extension or the bridge | [Discussions → Q&A](https://github.com/andreshma/ai-tab-grouper/discussions/categories/q-a) |
| Share an idea or discuss a design change before coding it | [Discussions → Ideas](https://github.com/andreshma/ai-tab-grouper/discussions/categories/ideas) |
| Report a reproducible bug | [New issue → Bug report](https://github.com/andreshma/ai-tab-grouper/issues/new?template=bug_report.yml) |
| Propose a concrete feature | [New issue → Feature request](https://github.com/andreshma/ai-tab-grouper/issues/new?template=feature_request.yml) |
| Report a security vulnerability | [Private advisory](https://github.com/andreshma/ai-tab-grouper/security/advisories/new) — never a public issue (see [SECURITY.md](SECURITY.md)) |

Before asking, please check the [usage guide](docs/USAGE.md) (installation, configuration, troubleshooting), the
[runbook](docs/runbook.md) and [TESTING.md](docs/TESTING.md).

When you report a problem, include the extension version, your Chrome and operating system versions, the status lines
shown in the popup and, for bridge problems, the output of `node bridge/doctor.mjs` (it never prints tab titles or
URLs). Do not paste tab titles, URLs, your API key or the bridge token.

There is no guaranteed response time. Pull requests that follow [CONTRIBUTING.md](CONTRIBUTING.md) are the fastest way
to get a fix in.
