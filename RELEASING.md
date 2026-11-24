# Releasing

Maintainer checklist. Publishing is done by hand, from the maintainer's machine.

## Every release

1. Bump the version in **three places**, all equal: `package.json` (`version`), `server.json` (`version` and `packages[0].version`), `src/server.ts` (`SERVER_VERSION`).
2. Merge to `main` through a PR with green CI.
3. From an **up-to-date** `main` (`git pull` first: publishing from a stale checkout tries to republish the old version and npm rejects it):

   ```bash
   git checkout main && git pull
   node -p "require('./package.json').version"   # must print the new version
   npm login            # once per machine
   npm publish          # runs typecheck, tests, build and the stdio check first; asks for 2FA
   ```

   npm answers `Your package is being processed`: the version can take a few minutes to become installable.

4. Check it installs from a clean folder:

   ```bash
   cd "$(mktemp -d)" && npx -y winevoyager-mcp   # starts and waits on stdio; Ctrl+C to exit
   ```

5. Publish the metadata to the MCP Registry (step below).
6. Tag the published commit and create the **GitHub Release** (replace `X.Y.Z`):

   ```bash
   git tag -a vX.Y.Z -m "winevoyager-mcp X.Y.Z" && git push origin vX.Y.Z
   gh release create vX.Y.Z --verify-tag --latest --title "vX.Y.Z" --notes "What changed…"
   ```

   The Release, not the tag alone, is what Glama listens to: with **Auto-Release** on, it rebuilds the server, re-inspects the tools and updates the listing and its score.

## MCP Registry (`tours.winevoyager/mcp`)

The registry only stores metadata (`server.json`); the code comes from npm, so publish to npm first.
The name `tours.winevoyager/mcp` is the reverse-DNS form of `winevoyager.tours` and is verified with a DNS TXT record.

### One-time setup: DNS key

macOS ships LibreSSL, which has no Ed25519: use OpenSSL 3 (`brew install openssl@3`).
Keep `key.pem` **outside the repository** (e.g. in a password manager); `.gitignore` blocks `*.pem` as a safety net.

```bash
OPENSSL=/opt/homebrew/opt/openssl@3/bin/openssl
mkdir -p ~/.config/winevoyager && cd ~/.config/winevoyager
$OPENSSL genpkey -algorithm Ed25519 -out key.pem
PUBLIC_KEY="$($OPENSSL pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "winevoyager.tours. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
```

Add that TXT record on the **apex** `winevoyager.tours` (not on a subdomain) at the DNS provider and wait for it to propagate:

```bash
dig +short TXT winevoyager.tours
```

### Publish

```bash
brew install mcp-publisher
# the key goes through an environment variable, not the command line
MCP_PRIVATE_KEY="$($OPENSSL pkey -in ~/.config/winevoyager/key.pem -noout -text | sed -n '/priv:/,/pub:/p' | sed '1d;$d' | tr -d ' :\n')" \
  mcp-publisher login dns --domain winevoyager.tours
mcp-publisher validate
mcp-publisher publish
```

Check it is listed:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=tours.winevoyager"
```
