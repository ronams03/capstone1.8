# Git Change Branch

This project is in:

`C:\xampp\htdocs\capstone1`

The remote repo is:

`https://github.com/ronams03/capstone1.5.git`

## What happened

The local branch was:

`capstone1.5`

The code was pushed to the remote branch:

`1.0`

That was done with:

```powershell
git push origin HEAD:1.0
```

Meaning:

- `HEAD` = the current checked-out local commit
- `1.0` = the target branch name on the remote repo

So Git pushed the current local work into the remote branch `1.0` even though the local branch name was `capstone1.5`.

## Useful commands

Check current remote:

```powershell
git remote -v
```

Check branches:

```powershell
git branch --all
```

Check current status:

```powershell
git status --short --branch
```

Commit tracked changes:

```powershell
git add -u
git commit -m "Your commit message"
```

Push current local branch to remote branch `1.0`:

```powershell
git push origin HEAD:1.0
```

Switch to branch `1.0` if it already exists locally:

```powershell
git checkout 1.0
```

Create a new branch:

```powershell
git checkout -b capstone1.5
```

Rename current branch:

```powershell
git branch -m capstone1.5
```

Change remote repo URL:

```powershell
git remote set-url origin https://github.com/ronams03/capstone1.5.git
```
