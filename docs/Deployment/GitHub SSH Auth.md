---
title: GitHub SSH Auth
tags: [deployment, github, ssh]
date: 2026-05-26
---

# GitHub SSH Auth

The repo lives at **[github.com/MixedAR/matrix-ai-intelligence](https://github.com/MixedAR/matrix-ai-intelligence)**. Authenticated via SSH key (no HTTPS password prompts).

## Key file

```
~/.ssh/id_ed25519        ← private key (600 perms)
~/.ssh/id_ed25519.pub    ← public key (added to github.com/settings/keys)
```

## Key fingerprint

```
SHA256:278k03iVYbVpPfEFwILvYENB72P1hoAD7GFfqFchAgY
Title:  Matrix dashboard deploy
Type:   ED25519
```

## How it was set up

```bash
# 1. Generate the key (no passphrase for automated deploys)
ssh-keygen -t ed25519 -C "matrix-deploy-20260526" -f ~/.ssh/id_ed25519 -N "" -q
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub

# 2. Add the public key at https://github.com/settings/ssh/new
cat ~/.ssh/id_ed25519.pub
# → ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN9CvOB9aiwth1QM1atOnGsJLQjPKr3RNZTwsDIP5dh4 matrix-deploy-20260526

# 3. Switch the git remote to SSH URL
cd "/Users/stevecaudle/Matrix-AI-Intelligence app"
git remote set-url origin git@github.com:MixedAR/matrix-ai-intelligence.git

# 4. Test
ssh -T -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes git@github.com
# → Hi MixedAR! You've successfully authenticated...
```

## Persist for this repo

So every `git push` from this project uses the key without env-var tricks:

```bash
git config core.sshCommand "ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes"
```

Stored in `.git/config` — local-only, scoped to this repo.

## Repo state

```
remotes/
  origin: git@github.com:MixedAR/matrix-ai-intelligence.git
branches:
  main (tracks origin/main)
core.sshCommand: ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes
```

## Push from here onwards

```bash
git add .
git commit -m "..."
git push
```

That's it. SSH key handles auth silently.

## When the key needs to change

If you generate a new key or compromise the current one:

1. Generate new key (`ssh-keygen -t ed25519 ...`)
2. Add new public key at github.com/settings/keys
3. Delete the old key from GitHub
4. Update `git config core.sshCommand` if file changed

## Related

- [[Deployment/Railway Setup]]
- [[Reference/Session Log 2026-05-26]]
