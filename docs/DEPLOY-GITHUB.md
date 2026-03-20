# Publish to GitHub

A local git repository is initialized with an initial commit on `main`.

## If `gh` is authenticated

```bash
cd /path/to/overemployed
gh auth login
gh repo create overemployed --public --source=. --remote=origin --push
```

Pick another repo name if `overemployed` is taken:

```bash
gh repo create YOUR_USERNAME/overemployed --public --source=. --remote=origin --push
```

## Manual (GitHub website)

1. Create a new **empty** repository (no README) on GitHub.
2. Add the remote and push:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

After the repo exists, connect it in **Vercel** for automatic deploys.

**Windows:** from the repo root you can run `.\scripts\publish-github.ps1` after `gh auth login`.

For the full chain (GitHub → Vercel env → EC2), see [DEPLOY-CHECKLIST.md](./DEPLOY-CHECKLIST.md).
