# ADR-0036: Windows code signing via Azure Artifact Signing

**Status:** Accepted (CI wiring dormant pending Azure account setup)
**Date:** 2026-08-23
**Deciders:** Michael Borck
**Evidence:** Microsoft Learn code-signing options page + Artifact Signing
docs (2026); Tauri v2 Windows signing docs; field reports (melatonin.dev
end-to-end guide, JUCE forum thread); 2026 price survey across
SSL.com / Certum / Sectigo / DigiCert

## Context

Since the Tauri migration, Windows builds ship **unsigned** — SmartScreen shows
"Unknown publisher" and, worse, the bundled PyInstaller backend exe trips
AV heuristics. macOS is signed + notarised (~A$150/yr Apple Developer). The
Windows equivalents were surveyed (2026):

| Option | Cost | Verdict |
|---|---|---|
| **Azure Artifact Signing Basic** | US$9.99/mo (~$120/yr) | Microsoft's own CA chain, managed short-lived certs, no hardware token, CI-native |
| SignPath Foundation | $0 | OSS-only, publisher shows "SignPath Foundation", per-release manual approval |
| Certum Open Source (cloud) | ~€49/yr | Publisher "Open Source Developer, <name>"; frequently out of stock; void if used commercially |
| SSL.com IV (individual) | ~US$97–129/yr | + eSigner cloud subscription on top; realistic ~$250–290/yr |
| Certum/Sectigo OV | ~$116–280/yr | Organisation validation + (usually) hardware token |
| EV (any CA) | $226–580/yr | **Pointless since 2024** — EV no longer bypasses SmartScreen |
| Microsoft Store | Free | Requires MSIX packaging (Tauri doesn't emit it) and abandons the GitHub-releases updater |

Individual validation on Azure is US/Canada-only, but **organisation
validation is available in Australia** and the developer trades as a sole
trader with a registered ABN — so organisation validation is the path.

## Decision

Sign Windows builds with **Azure Artifact Signing** (Basic tier), validated as
an **organisation** against the ABN. Wired into `tauri.yml` via Tauri's
`bundle.windows.signCommand` driving
[`artifact-signing-cli`](https://github.com/Levminer/artifact-signing-cli) —
one mechanism signs the app exe, the backend sidecar exe, **and** the NSIS
installer during the normal build. The wiring is **dormant**: it activates
only when repo variable `AZURE_SIGNING_ENABLED=true`, so releases keep
working (unsigned) until the Azure account exists.

Rejected: SignPath (publisher name isn't ours; per-release approval friction),
Certum OSS (stock + non-commercial terms), SSL.com IV (realistic cost once
eSigner is added), EV certs (no SmartScreen bypass since 2024), the Microsoft
Store (packaging contortions, breaks the updater flow).

## Setup runbook (do this in one sitting — billing starts at account creation)

1. Azure subscription (pay-as-you-go; nothing bills until step 3). Set the
   billing profile's legal name/address to **exactly** match the ABN record —
   validation compares them.
2. Portal → Subscriptions → Resource providers → register
   `Microsoft.CodeSigning`.
3. Create an **Artifact Signing account** (Basic, nearest offered region).
4. **Identity validation** (portal-only): organisation. Use the name exactly
   as it appears on ABN Lookup; the ABN as the business identifier. To show
   `borck.consulting` on the cert it must be the ASIC-registered business name
   linked to the ABN — if validation stalls >2 days, cancel and resubmit with
   the entity's legal name (field-reported fix). The personal-ID step runs
   through Microsoft Authenticator + AU10TIX; have ABN record + ASIC business
   name certificate + driver's licence/passport ready.
5. Create a **Public Trust certificate profile**.
6. Entra **App Registration** (client ID + secret + tenant ID) with the
   `Artifact Signing Certificate Profile Signer` role on the account.
7. Repo settings: variables `AZURE_SIGNING_ENABLED=true`,
   `AZURE_SIGNING_ENDPOINT` (e.g. `https://weu.codesigning.azure.net`),
   `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`; secrets
   `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID`.
8. Tag a release; confirm the Windows artifacts show the signature.

## Consequences

- **Cost:** US$9.99/mo, billed from account creation (no proration); 5,000
  signatures/month against ~5 per release. Deleting the account stops billing;
  existing installers stay valid via RFC-3161 timestamps.
- **SmartScreen:** no certificate silences it on day one (EV lost that in
  2024). Microsoft's docs say reputation builds over downloads; field reports
  for Artifact Signing claim identity-anchored instant reputation. Either way
  the prompt shows the validated org name instead of "Unknown publisher".
- Cert rotation is managed (short-lived certs) — no renewal handling, but the
  subscription must be active to sign new releases.
- Local/dev builds are unaffected (the committed Tauri config has no
  signCommand; the overlay mutation happens in CI only).
- Fallbacks if validation bounces: SignPath Foundation ($0) or Certum Open
  Source (~€49/yr) — both credible for this public MIT repo.
